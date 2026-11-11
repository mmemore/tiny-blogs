/**
 * 鉴权接口（契约 §5「认证」）。
 *
 * 三个刻意的选择：
 * - 登录与刷新都传 `authRetry: false`：它们是**用来**拿 token 的，
 *   若允许"401 → 刷新 → 重放"，刷新失败时会自己调自己，绕成死循环；
 * - 刷新成功后由调用方决定写不写 token（本文件不碰会话状态，保持纯 IO）；
 * - `logout` 允许失败：本地状态必须清干净，服务端那边失败不该把用户困在后台。
 */
import type { MeResponse, Principal, TokenResponse } from '@tiny-blogs/shared';
import { apiGet, apiPost } from './client';

/**
 * 用用户名口令换 access token（refresh token 走 Set-Cookie，JS 看不到）。
 *
 * @param username 用户名。
 * @param password 明文口令。
 * @returns 新的 access token。
 * @throws {ApiRequestError} 401 `INVALID_CREDENTIALS`（用户名或密码不对）/ 429 `RATE_LIMITED`。
 */
export function requestLogin(username: string, password: string): Promise<TokenResponse> {
  return apiPost<TokenResponse>('/auth/login', { username, password }, { authRetry: false });
}

/**
 * 用 refresh cookie 换新的 access token。
 *
 * @returns 新的 access token。
 * @throws {ApiRequestError} 401 `REFRESH_INVALID` / `REFRESH_REPLAYED`。
 */
export function requestRefresh(): Promise<TokenResponse> {
  return apiPost<TokenResponse>('/auth/refresh', undefined, { authRetry: false });
}

/**
 * 读当前登录者。
 *
 * @param authRetry 是否允许"401 → 刷新 → 重放"。会话校验路径应传 `false`，
 *   否则刷新过程中再进一次刷新会自锁（并发合流会等自己）。
 * @returns 登录者身份。
 */
export function requestMe(authRetry = true): Promise<Principal> {
  return apiGet<MeResponse>('/auth/me', undefined, { authRetry });
}

/**
 * 注销：服务端吊销 refresh token 并清 cookie。
 *
 * @returns 完成即返回（失败也不抛，交由调用方决定是否提示）。
 */
export async function requestLogout(): Promise<void> {
  try {
    await apiPost<void>('/auth/logout', undefined, { authRetry: false });
  } catch {
    // 服务端会话可能已经过期；本地清理照常进行。
  }
}
