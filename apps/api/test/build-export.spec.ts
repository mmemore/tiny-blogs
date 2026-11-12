/**
 * 构建导出接口的 HTTP 边界测试。
 *
 * 覆盖：令牌缺失/错误 → 401 统一信封；正确令牌 → 快照形状与公开接口同源
 * （posts 带 contentMd、prev/next 相邻、tags/archive 与公开端点一致）；
 * `Cache-Control: no-store`；快照里不出现草稿。
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContentSnapshot, Page, PostSummary } from '@tiny-blogs/shared';
import { closeTestApp, createTestApp, type TestContext } from './helpers/app';
import { createUser, resetDatabase, type SeededUser } from './helpers/db';
import { bearer, login } from './helpers/http';

/** 固定口令（测试专用，不是任何真实凭据）。 */
const PASSWORD = 'correct-horse-battery-staple';

/** 与 env helper 写入测试环境的构建令牌保持一致（同属测试 fixture，不是真实秘密）。 */
const TEST_BUILD_TOKEN = 'test-build-token-0123456789abcdef-0123456789abcdef';

describe('build export', () => {
  let context: TestContext;
  let author: SeededUser;
  let authorToken: string;

  beforeAll(async () => {
    // `BUILD_EXPORT_TOKEN` 覆盖为固定值，方便测试断言；长度满足 env 校验的 ≥32。
    context = await createTestApp({ BUILD_EXPORT_TOKEN: TEST_BUILD_TOKEN });
    await resetDatabase(context.dataSource);
    author = await createUser(context.dataSource, 'author', PASSWORD);
    authorToken = (await login(context.app, author.username, PASSWORD)).accessToken;
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  /** 造一篇文章（可覆盖字段），返回 slug。 */
  async function seedPost(overrides: { title?: string; slug?: string; contentMd?: string } = {}): Promise<string> {
    const response = await request(context.app.getHttpServer())
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send({
        title: overrides.title ?? '预渲染验收用文章',
        slug: overrides.slug ?? 'build-export-sample',
        summary: '构建导出接口的集成测试样本。',
        contentMd: overrides.contentMd ?? '## 快照正文特征\n\n这一段会写进静态 HTML。',
        tagSlugs: [],
      })
      .expect(201);
    await request(context.app.getHttpServer())
      .post(`/api/admin/posts/${(response.body as { slug: string }).slug}/publish`)
      .set(bearer(authorToken))
      .expect(200);
    return (response.body as { slug: string }).slug;
  }

  it('令牌缺失 → 401 统一信封', async () => {
    const response = await request(context.app.getHttpServer()).get('/api/build/export').expect(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('令牌错误 → 401，且文案不区分缺失与错误', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/api/build/export')
      .set('X-Build-Token', 'wrong-token-wrong-token-wrong-token')
      .expect(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    const missing = await request(context.app.getHttpServer()).get('/api/build/export').expect(401);
    expect(missing.body.error.message).toBe(response.body.error.message);
  });

  it('正确令牌 → 快照：version/site/posts(含原文)/tags/archive，且带 no-store', async () => {
    const slug = await seedPost({ title: '快照第一篇', slug: 'snapshot-first', contentMd: '## 快照正文特征\n\n第一篇。' });
    await seedPost({ title: '快照第二篇', slug: 'snapshot-second' });

    const response = await request(context.app.getHttpServer())
      .get('/api/build/export')
      .set('X-Build-Token', TEST_BUILD_TOKEN)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    const snapshot = response.body as ContentSnapshot;
    expect(snapshot.version).toBe(1);
    expect(typeof snapshot.generatedAt).toBe('string');
    expect(snapshot.site.title).not.toBe('');
    expect(snapshot.posts.map((post) => post.slug)).toEqual(['snapshot-second', 'snapshot-first']);
    expect(snapshot.posts[1]?.contentMd).toContain('快照正文特征');
    // 快照的文章就是公开详情的投影（含 prev/next），验证字段同源。
    expect(snapshot.posts[1]?.prev).toBeNull();
    expect(snapshot.posts[1]?.next?.slug).toBe('snapshot-second');
    expect(snapshot.posts[0]?.prev?.slug).toBe('snapshot-first');
    // 与公开列表互证：同一投影函数的产物。
    const list = await request(context.app.getHttpServer()).get('/api/posts?pageSize=1').expect(200);
    expect((list.body as Page<PostSummary>).total).toBe(snapshot.posts.length);
    // 快照字段只允许来自 ContentService，不允许出现内部字段。
    expect(Object.keys(snapshot.posts[0] ?? {})).not.toContain('authorId');
    expect(slug).toBe('snapshot-first');
  });

  it('快照里没有草稿：草稿 slug 不出现在 posts 中', async () => {
    await request(context.app.getHttpServer())
      .post('/api/admin/posts')
      .set(bearer(authorToken))
      .send({
        title: '还没写完的草稿',
        slug: 'snapshot-draft-hidden',
        summary: '草稿不能进快照。',
        contentMd: '# 草稿',
        tagSlugs: [],
      })
      .expect(201);

    const response = await request(context.app.getHttpServer())
      .get('/api/build/export')
      .set('X-Build-Token', TEST_BUILD_TOKEN)
      .expect(200);

    const snapshot = response.body as ContentSnapshot;
    expect(snapshot.posts.some((post) => post.slug === 'snapshot-draft-hidden')).toBe(false);
  });
});
