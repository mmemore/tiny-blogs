import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, type TestContext } from './helpers/app';
import { createUser, resetDatabase } from './helpers/db';

/**
 * 票 03：登录限流。
 *
 * 单独一个文件 + 单独一个应用实例，因为这个用例必须用**真实的** 5 次/分钟配置，
 * 而其它鉴权用例把限流调高了（否则同一 IP 的多次登录会互相污染）。
 */
describe('login rate limit', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestApp({ AUTH_LOGIN_RATE_LIMIT: '5', AUTH_LOGIN_RATE_WINDOW_MS: '60000' });
    await resetDatabase(context.dataSource);
    await createUser(context.dataSource, 'rate-limited', 'correct-horse-battery-staple');
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  it('同一 IP 第 6 次登录返回 429，且错误体走统一信封', async () => {
    const server = context.app.getHttpServer();
    const payload = { username: 'rate-limited', password: 'wrong-password' };

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      // 前 5 次都是"凭证错误"，不是 429
      await request(server).post('/api/auth/login').send(payload).expect(401);
    }

    const limited = await request(server).post('/api/auth/login').send(payload).expect(429);
    expect(limited.body).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.any(String) },
    });
  });
});
