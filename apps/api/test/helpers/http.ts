/**
 * HTTP 断言辅助：登录、取 cookie、拼认证头。
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/** 一次登录的结果。`cookie` 是可直接放进 `Cookie` 头的 `refresh_token=…`。 */
export interface Session {
  readonly accessToken: string;
  readonly cookie: string;
  readonly setCookie: readonly string[];
}

/**
 * 从 `Set-Cookie` 头里挑出 refresh cookie。
 *
 * @param setCookie supertest 解析出的 `set-cookie` 数组。
 * @returns 形如 `refresh_token=abc` 的字符串。
 */
export function extractRefreshCookie(setCookie: readonly string[]): string {
  const target = setCookie.find((item) => item.startsWith('refresh_token='));
  if (target === undefined) {
    throw new Error(`响应里没有 refresh_token cookie：${JSON.stringify(setCookie)}`);
  }
  return target.split(';')[0] ?? '';
}

/**
 * 走真实接口登录。
 *
 * @param app 测试应用。
 * @param username 登录名。
 * @param password 明文口令。
 * @returns access token 与 refresh cookie。
 */
export async function login(
  app: INestApplication,
  username: string,
  password: string,
): Promise<Session> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);

  const setCookie = (response.headers['set-cookie'] ?? []) as unknown as string[];
  const body = response.body as { accessToken: string };

  return { accessToken: body.accessToken, cookie: extractRefreshCookie(setCookie), setCookie };
}

/**
 * 拼认证头。
 *
 * @param accessToken access token。
 * @returns 可直接 `.set(...)` 的头对象。
 */
export function bearer(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}
