/**
 * 票 09：上传链路（HTTP 边界）。
 *
 * 覆盖四件事：
 * 1. 鉴权：没 token 一律 401，别把上传口暴露给匿名流量；
 * 2. 成功路径：返回 `{ key, url }`，字节真的落在 `UPLOAD_DIR` 里；
 * 3. 静态服务：`/uploads/**` 能取到、Content-Type 正确、**不可列目录、不可穿越、不吃 dotfile**；
 * 4. 拒绝路径：超限 422 `FILE_TOO_LARGE`、非白名单 422 `UNSUPPORTED_MEDIA_TYPE`。
 *
 * 这里用**默认** `UPLOAD_MAX_BYTES`（5 MB），所以"6 MB 被拒"是拿真实上限验的；
 * 边界值（恰好等于上限）在上限更小的单元测试里验，避免这里传 5 MB 的样本。
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UploadResult } from '@tiny-blogs/shared';
import { closeTestApp, createTestApp, type TestContext } from './helpers/app';
import { createUser, resetDatabase, type SeededUser } from './helpers/db';
import { bearer, login } from './helpers/http';

/** 固定口令（测试专用，不是任何真实凭据）。 */
const PASSWORD = 'correct-horse-battery-staple';

/** 一张最小的合法 PNG（8 字节魔数 + 少量数据）。 */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('tiny-blogs-upload-endpoint', 'utf8'),
]);

/** 一个伪装成 `image/png` 的 Windows 可执行文件头（MZ）。 */
const EXE_BYTES = Buffer.from('MZ\x90\x00\x03\x00\x00\x00payload', 'latin1');

describe('admin upload', () => {
  let context: TestContext;
  let user: SeededUser;
  let token: string;
  let uploadDir: string;

  beforeAll(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'tiny-blogs-e2e-upload-'));
    context = await createTestApp({ UPLOAD_DIR: uploadDir });
    await resetDatabase(context.dataSource);

    user = await createUser(context.dataSource, 'uploader', PASSWORD);
    token = (await login(context.app, user.username, PASSWORD)).accessToken;
  });

  afterAll(async () => {
    await closeTestApp(context);
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('未登录上传 → 401', async () => {
    await request(context.app.getHttpServer())
      .post('/api/admin/upload')
      .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(401);
  });

  it('缺 multipart 字段 → 422', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/admin/upload')
      .set(bearer(token))
      .expect(422);

    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('上传 PNG：201，返回 key 与站内 url，字节落在 UPLOAD_DIR', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/admin/upload')
      .set(bearer(token))
      // 故意把 Content-Type 报成 jpeg：落盘扩展名应回到字节的真实类型。
      .attach('file', PNG_BYTES, { filename: 'fake.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const body = response.body as UploadResult;
    expect(body.key).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]{8}\.png$/);
    expect(body.url).toBe(`/uploads/${body.key}`);

    const onDisk = await stat(join(uploadDir, body.key));
    expect(onDisk.size).toBe(PNG_BYTES.length);
  });

  it('重复上传同一张图返回同一个 key（按内容去重）', async () => {
    const first = await request(context.app.getHttpServer())
      .post('/api/admin/upload')
      .set(bearer(token))
      .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const second = await request(context.app.getHttpServer())
      .post('/api/admin/upload')
      .set(bearer(token))
      .attach('file', PNG_BYTES, { filename: 'b.png', contentType: 'image/png' })
      .expect(201);

    expect((second.body as UploadResult).key).toBe((first.body as UploadResult).key);
  });

  it('上传后的文件可以被静态服务取到，Content-Type 正确', async () => {
    const { body } = await request(context.app.getHttpServer())
      .post('/api/admin/upload')
      .set(bearer(token))
      .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);

    const response = await request(context.app.getHttpServer()).get((body as UploadResult).url).expect(200);

    expect(response.headers['content-type']).toBe('image/png');
    // key 是内容哈希，内容永久不变，所以应该带长缓存头。
    expect(response.headers['cache-control']).toContain('immutable');
    expect(Buffer.from(response.body as Buffer).equals(PNG_BYTES)).toBe(true);
  });

  it('取不存在的图片 → 404，且是统一错误信封而不是 express 的 HTML', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/uploads/2026/11/deadbeef.png')
      .expect(404);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('目录不可列（没有 index、也没有目录列表）', async () => {
    const response = await request(context.app.getHttpServer()).get('/uploads/');
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.text).not.toContain('Index of');
  });

  it('路径穿越一律取不到文件（.env 不会被吐出来）', async () => {
    const attempts = [
      '/uploads/../../.env',
      '/uploads/%2e%2e%2f%2e%2e%2f.env',
      '/uploads/2026/11/..%2f..%2f..%2f.env',
      '/uploads/.env',
    ];

    for (const path of attempts) {
      const response = await request(context.app.getHttpServer()).get(path);
      expect(response.status, `${path} 不应返回 2xx`).toBeGreaterThanOrEqual(400);
      expect(response.text).not.toContain('DB_PASSWORD');
    }
  });

  it('伪装成 png 的可执行文件 → 422 UNSUPPORTED_MEDIA_TYPE', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/admin/upload')
      .set(bearer(token))
      .attach('file', EXE_BYTES, { filename: 'evil.exe.png', contentType: 'image/png' })
      .expect(422);

    expect(response.body).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
  });

  it('超过 5 MB → 422 FILE_TOO_LARGE', async () => {
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(6 * 1024 * 1024)]);

    const response = await request(context.app.getHttpServer())
      .post('/api/admin/upload')
      .set(bearer(token))
      .attach('file', oversized, { filename: 'huge.png', contentType: 'image/png' })
      .expect(422);

    expect(response.body).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
  });
});
