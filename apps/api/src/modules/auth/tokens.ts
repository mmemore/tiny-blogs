import { randomBytes, createHash } from 'node:crypto';
import type { CookieOptions } from 'express';
import { API_PREFIX } from '@tiny-blogs/shared';
import type { ApiEnv } from '../../config/env';

/** httpOnly cookie 的名字（契约 §5）。 */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/** refresh token 的 cookie 路径：只在 /api/auth 下发送，其它接口拿不到它。 */
export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

/** 一天的毫秒数。 */
export const DAY_MS = 86_400_000;

/**
 * 生成刷新令牌原文（32 字节熵的 base64url）。
 * 原文只出现在 cookie 里，库里只存它的 sha256。
 *
 * @returns 可直接放进 cookie 的随机串。
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * 计算刷新令牌的存储指纹（sha256 十六进制，64 字符，对应 `char(64)`）。
 *
 * @param raw 刷新令牌原文。
 * @returns 十六进制摘要。
 */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * 从 `Authorization` 头里取出 Bearer token。
 *
 * @param header 原始请求头。
 * @returns token 字符串；缺失或格式不符时返回 `null`。
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }
  const matched = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return matched === null ? null : (matched[1] ?? null);
}

/**
 * 刷新令牌的 cookie 属性（契约 §5：httpOnly、SameSite=Strict、Path=/api/auth、30 天）。
 *
 * @param env 校验后的配置。
 * @returns express 的 cookie 选项。
 */
export function refreshCookieOptions(env: ApiEnv): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.isProduction,
    path: REFRESH_COOKIE_PATH,
    maxAge: env.auth.jwt.refreshTokenTtlDays * DAY_MS,
  };
}

/**
 * 清除 refresh cookie 时用的属性。
 *
 * 与写入时保持同样的 `path` / `sameSite` / `httpOnly`，否则浏览器不会清除；
 * 只是不带 `maxAge`（express 对 `clearCookie` 传 maxAge 已标记为废弃）。
 *
 * @param env 校验后的配置。
 * @returns express 的 cookie 选项。
 */
export function refreshCookieClearOptions(env: ApiEnv): CookieOptions {
  const { maxAge: _maxAge, ...rest } = refreshCookieOptions(env);
  return rest;
}

/**
 * 登录失败时的等时假校验目标。
 *
 * 它是一段**公开的** argon2id 哈希，对应一个与本系统无关的字符串，没有任何账号使用它。
 * 作用只有一个：用户名不存在时也跑一次同代价的 argon2 校验，
 * 让"账号不存在"与"口令错误"两条路径的响应时间无法被区分。
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$gENG8vsMloHesHULK6P4rQ$wFfagsUjeGASDKRkWk/qdlZMy4ZLOSgRfu4P2ZzDidQ';
