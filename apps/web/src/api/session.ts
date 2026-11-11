/**
 * 会话桥：API 层与 store 之间的最小耦合点。
 *
 * 为什么需要这一层：`client.ts` 想读 access token、想在手握 401 时触发一次刷新，
 * 但它**不能** import `stores/auth.ts`（store 又要 import client 去发请求，会成环），
 * 也不能 import `router.ts`（路由守卫要读 store，同样是环）。
 * 于是把"状态"和"能力"都放在这个没有任何依赖的模块里：
 *
 * - 状态：`accessToken` 只在这里（内存），符合 ADR-0003；
 * - 能力：刷新函数由 store 在创建时注册，会话失效处理器由 router 在创建时注册。
 *
 * 单一职责之外还有一个硬要求：**并发 401 只能触发一次刷新**（single-flight），
 * 否则十个并发请求会各自拿旧 refresh token 去换新，后端会按"重放"把会话整个作废。
 */

/** 当前 access token（`null` 表示未登录）。只存内存，绝不落盘。 */
let accessToken: string | null = null;

/** 刷新会话的实现（由 `stores/auth.ts` 注册）。 */
let refreshHandler: (() => Promise<boolean>) | null = null;

/** 会话彻底失效后的处理（由 `router.ts` 注册，负责跳登录页）。 */
let expiredHandler: (() => void) | null = null;

/** 进行中的刷新，用于把并发 401 合并成一次请求。 */
let inFlightRefresh: Promise<boolean> | null = null;

/**
 * 读当前 access token。
 *
 * @returns token 字符串；未登录为 `null`。
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * 写入或清除 access token。
 *
 * @param token 新 token；传 `null` 清除。
 */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * 注册刷新实现。
 *
 * @param handler 成功返回 `true`（并自行写入新 token），失败返回 `false`。
 */
export function registerRefreshHandler(handler: () => Promise<boolean>): void {
  refreshHandler = handler;
}

/**
 * 注册会话失效处理。
 *
 * @param handler 无参回调，通常是"清状态 + 跳登录页"。
 */
export function registerExpiredHandler(handler: () => void): void {
  expiredHandler = handler;
}

/**
 * 刷新会话（并发安全）。
 *
 * 多个请求同时拿到 401 时，只有第一个真正发刷新请求，其余共享同一个 Promise。
 *
 * @returns 刷新成功为 `true`。
 */
export function refreshSession(): Promise<boolean> {
  if (refreshHandler === null) {
    return Promise.resolve(false);
  }
  if (inFlightRefresh === null) {
    inFlightRefresh = refreshHandler().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

/** 通知"会话已失效"（刷新也救不回来）。调用方随后应跳登录页。 */
export function notifySessionExpired(): void {
  accessToken = null;
  expiredHandler?.();
}
