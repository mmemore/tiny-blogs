import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, type TestContext } from './helpers/app';
import {
  countActiveRefreshTokens,
  createUser,
  getTokenVersion,
  resetDatabase,
  type SeededUser,
} from './helpers/db';
import { bearer, extractRefreshCookie, login } from './helpers/http';

/** 固定口令（测试专用，不是任何真实凭据）。 */
const PASSWORD = 'correct-horse-battery-staple';

/**
 * 鉴权闭环，全部走 HTTP 边界（supertest 打真实 Nest 应用 + 真实 MySQL）。
 *
 * 每个攻击场景用独立账号，避免"撤销全部会话"这类副作用污染其它用例。
 */
describe('auth loop', () => {
  let context: TestContext;
  let admin: SeededUser;
  let replayUser: SeededUser;
  let staleUser: SeededUser;
  let logoutUser: SeededUser;
  let expiryUser: SeededUser;

  beforeAll(async () => {
    context = await createTestApp();
    await resetDatabase(context.dataSource);

    admin = await createUser(context.dataSource, 'admin', PASSWORD);
    replayUser = await createUser(context.dataSource, 'replay-user', PASSWORD);
    staleUser = await createUser(context.dataSource, 'stale-user', PASSWORD);
    logoutUser = await createUser(context.dataSource, 'logout-user', PASSWORD);
    expiryUser = await createUser(context.dataSource, 'expiry-user', PASSWORD);
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  it('登录成功：返回 access token，refresh 只写进 httpOnly cookie', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: admin.username, password: PASSWORD })
      .expect(200);

    const body = response.body as { accessToken?: string };
    expect(typeof body.accessToken).toBe('string');
    // 响应体里绝不含 refresh token（它只经 cookie 传递）。
    expect(Object.keys(body)).toEqual(['accessToken']);

    const setCookie = (response.headers['set-cookie'] ?? []) as unknown as string[];
    const cookie = setCookie.find((item) => item.startsWith('refresh_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth');
    // 30 天 = 2592000 秒
    expect(cookie).toContain('Max-Age=2592000');
  });

  it('登录失败：口令错误与账号不存在返回完全相同的 401 信封', async () => {
    const server = context.app.getHttpServer();

    const wrongPassword = await request(server)
      .post('/api/auth/login')
      .send({ username: admin.username, password: 'definitely-not-the-password' })
      .expect(401);

    const missingUser = await request(server)
      .post('/api/auth/login')
      .send({ username: 'no-such-user', password: 'definitely-not-the-password' })
      .expect(401);

    expect(wrongPassword.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) },
    });
    expect(missingUser.body).toEqual(wrongPassword.body);
  });

  it('登录失败：两条失败路径都执行了 argon2 校验（耗时不可区分）', async () => {
    const server = context.app.getHttpServer();

    const measure = async (username: string): Promise<number> => {
      const startedAt = process.hrtime.bigint();
      await request(server).post('/api/auth/login').send({ username, password: 'wrong-password' });
      return Number(process.hrtime.bigint() - startedAt) / 1e6;
    };

    const existingUserMs = await measure(admin.username);
    const unknownUserMs = await measure('still-no-such-user');

    // argon2id（19 MiB / 2 轮）本身有几十毫秒的下限，两条路径都跑到了它。
    expect(existingUserMs).toBeGreaterThan(5);
    expect(unknownUserMs).toBeGreaterThan(5);
    // 时间差不应出现数量级差异（假校验若缺失，未知账号会快到只有几毫秒）。
    const ratio = Math.max(existingUserMs, unknownUserMs) / Math.min(existingUserMs, unknownUserMs);
    expect(ratio).toBeLessThan(4);
  });

  it('GET /api/auth/me：带 access 返回本人，缺失或伪造 access 一律 401', async () => {
    const session = await login(context.app, admin.username, PASSWORD);
    const server = context.app.getHttpServer();

    const me = await request(server).get('/api/auth/me').set(bearer(session.accessToken)).expect(200);
    expect(me.body).toEqual({ id: admin.id, username: admin.username });

    await request(server).get('/api/auth/me').expect(401);
    await request(server)
      .get('/api/auth/me')
      .set({ Authorization: 'Bearer not-a-real-token' })
      .expect(401);
    expect((await request(server).get('/api/auth/me').set(bearer('garbage'))).body).toEqual({
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    });
  });

  it('refresh 轮换：旧 token 作废，新 token 可用，活跃会话数不变', async () => {
    const session = await login(context.app, admin.username, PASSWORD);
    const server = context.app.getHttpServer();
    const activeBefore = await countActiveRefreshTokens(context.dataSource, admin.id);

    const rotated = await request(server)
      .post('/api/auth/refresh')
      .set({ Cookie: session.cookie })
      .expect(200);

    const newCookie = extractRefreshCookie(
      (rotated.headers['set-cookie'] ?? []) as unknown as string[],
    );
    expect(newCookie).not.toBe(session.cookie);

    // 新 access 可用
    const newAccess = (rotated.body as { accessToken: string }).accessToken;
    await request(server).get('/api/auth/me').set(bearer(newAccess)).expect(200);

    // 旧行被撤销、新行插入：活跃条数不变（轮换而不是叠加会话）
    expect(await countActiveRefreshTokens(context.dataSource, admin.id)).toBe(activeBefore);
  });

  it('重放检测：已轮换的 refresh 再次出现 → 撤销全部会话 + token_version 自增', async () => {
    const session = await login(context.app, replayUser.username, PASSWORD);
    const server = context.app.getHttpServer();
    const versionBefore = await getTokenVersion(context.dataSource, replayUser.id);

    const rotated = await request(server)
      .post('/api/auth/refresh')
      .set({ Cookie: session.cookie })
      .expect(200);
    const rotatedCookie = extractRefreshCookie(
      (rotated.headers['set-cookie'] ?? []) as unknown as string[],
    );
    const rotatedAccess = (rotated.body as { accessToken: string }).accessToken;

    // 旧 cookie 二次使用：重放
    const replay = await request(server)
      .post('/api/auth/refresh')
      .set({ Cookie: session.cookie })
      .expect(401);
    expect(replay.body).toEqual({
      error: { code: 'REFRESH_REPLAYED', message: expect.any(String) },
    });

    // 全部会话被撤销：连刚轮换出来的那条也不可用
    await request(server).post('/api/auth/refresh').set({ Cookie: rotatedCookie }).expect(401);
    expect(await countActiveRefreshTokens(context.dataSource, replayUser.id)).toBe(0);
    // 每次检测到重放都会自增（上面第二次请求同样是被作废的 token），至少 +1。
    expect(await getTokenVersion(context.dataSource, replayUser.id)).toBeGreaterThanOrEqual(
      versionBefore + 1,
    );

    // 旧 access（version 提升前签发）立刻失效
    await request(server).get('/api/auth/me').set(bearer(rotatedAccess)).expect(401);
  });

  it('token_version 提升后，旧 access 一律 401（强制下线）', async () => {
    const session = await login(context.app, staleUser.username, PASSWORD);
    const server = context.app.getHttpServer();

    await request(server).get('/api/auth/me').set(bearer(session.accessToken)).expect(200);

    await context.dataSource.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [
      staleUser.id,
    ]);

    const rejected = await request(server)
      .get('/api/auth/me')
      .set(bearer(session.accessToken))
      .expect(401);
    expect((rejected.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('access 过期后用 cookie 换新 access，新 access 可继续访问', async () => {
    const session = await login(context.app, expiryUser.username, PASSWORD);
    const server = context.app.getHttpServer();
    const jwt = context.app.get(JwtService);

    const expired = await jwt.signAsync(
      { sub: expiryUser.id, userId: expiryUser.id, ver: 0 },
      { expiresIn: -10 },
    );
    await request(server).get('/api/auth/me').set(bearer(expired)).expect(401);

    const refreshed = await request(server)
      .post('/api/auth/refresh')
      .set({ Cookie: session.cookie })
      .expect(200);
    const access = (refreshed.body as { accessToken: string }).accessToken;
    const me = await request(server).get('/api/auth/me').set(bearer(access)).expect(200);
    expect((me.body as { username: string }).username).toBe(expiryUser.username);
  });

  it('refresh 缺少 cookie 或伪造 token 时返回 401 REFRESH_INVALID', async () => {
    const server = context.app.getHttpServer();

    const missing = await request(server).post('/api/auth/refresh').expect(401);
    expect((missing.body as { error: { code: string } }).error.code).toBe('REFRESH_INVALID');

    const forged = await request(server)
      .post('/api/auth/refresh')
      .set({ Cookie: 'refresh_token=forged-token-value' })
      .expect(401);
    expect((forged.body as { error: { code: string } }).error.code).toBe('REFRESH_INVALID');
  });

  it('logout：撤销 refresh 并清 cookie；无 cookie 也返回 204（幂等）', async () => {
    const session = await login(context.app, logoutUser.username, PASSWORD);
    const server = context.app.getHttpServer();

    expect(await countActiveRefreshTokens(context.dataSource, logoutUser.id)).toBe(1);

    const response = await request(server)
      .post('/api/auth/logout')
      .set({ Cookie: session.cookie })
      .expect(204);
    const clearedCookie = ((response.headers['set-cookie'] ?? []) as unknown as string[]).find(
      (item) => item.startsWith('refresh_token='),
    );
    expect(clearedCookie).toBeDefined();

    expect(await countActiveRefreshTokens(context.dataSource, logoutUser.id)).toBe(0);
    await request(server).post('/api/auth/refresh').set({ Cookie: session.cookie }).expect(401);

    // 幂等：没有 cookie 也不报错
    await request(server).post('/api/auth/logout').expect(204);
  });

  it('登录入参不合法时返回 422 与统一错误信封', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: '', password: 123 })
      .expect(422);

    expect(response.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: expect.any(String) },
    });
  });
});
