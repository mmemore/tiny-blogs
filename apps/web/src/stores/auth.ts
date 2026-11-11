/**
 * 登录态（Pinia，**只在内存**）。
 *
 * ADR-0003 的硬约束：access token 绝不写 localStorage / sessionStorage / document.cookie。
 * 落盘看起来"体验更好"，实际会让一次 XSS 变成一次长期账号劫持；
 * 刷新页面后靠 httpOnly 的 refresh cookie 静默续期即可，用户完全无感。
 *
 * 这个 store 还承担两个装配职责：
 * 1. 把自己注册成 `api/session.ts` 的刷新实现——API 层遇到 401 时调它；
 * 2. 提供 `ensureSession()` 给路由守卫，让"直接访问 /admin/posts"也能恢复登录态。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Principal } from '@tiny-blogs/shared';
import { requestLogin, requestLogout, requestMe, requestRefresh } from '../api/auth';
import { registerRefreshHandler, setAccessToken } from '../api/session';

export const useSessionStore = defineStore('session', () => {
  /** 当前登录者（`null` 表示未登录）。 */
  const principal = ref<Principal | null>(null);

  /** 是否已经完成过一次会话恢复尝试（避免每次导航都去打 refresh）。 */
  const settled = ref(false);

  /** 进行中的恢复，用于把并发导航合并成一次请求。 */
  let inFlightRestore: Promise<boolean> | null = null;

  /** 是否已登录。 */
  const isAuthenticated = computed(() => principal.value !== null);

  /** 清空本地会话状态（不发请求）。 */
  function clear(): void {
    setAccessToken(null);
    principal.value = null;
    settled.value = true;
  }

  /**
   * 用新 token 换出身份，一步到位写进 store。
   *
   * @param accessToken 刚拿到的 access token。
   * @returns 完成即返回。
   * @throws {ApiRequestError} token 不被接受（理论上不该发生）。
   */
  async function adopt(accessToken: string): Promise<void> {
    setAccessToken(accessToken);
    // `requestMe(false)`：这里正处于"刚换完 token"的临界区，
    // 若再让它触发 401 → 刷新，会等待自己这个 in-flight 刷新，形成自锁。
    principal.value = await requestMe(false);
    settled.value = true;
  }

  /**
   * 静默续期（不抛错，供 API 层与守卫使用）。
   *
   * @returns 成功 `true`；没有有效 refresh cookie 时 `false`。
   */
  async function silentRefresh(): Promise<boolean> {
    try {
      const { accessToken } = await requestRefresh();
      await adopt(accessToken);
      return true;
    } catch {
      clear();
      return false;
    }
  }

  /**
   * 用口令登录。
   *
   * @param username 用户名。
   * @param password 明文口令。
   * @returns 完成即返回。
   * @throws {ApiRequestError} 401 `INVALID_CREDENTIALS` / 429 `RATE_LIMITED`。
   */
  async function login(username: string, password: string): Promise<void> {
    const { accessToken } = await requestLogin(username, password);
    await adopt(accessToken);
  }

  /**
   * 确保会话可用（路由守卫的入口）。
   *
   * 已登录直接 `true`；否则尝试一次静默续期（并发调用共享同一个 Promise）。
   *
   * @returns 会话可用为 `true`。
   */
  async function ensureSession(): Promise<boolean> {
    if (principal.value !== null) {
      return true;
    }
    if (inFlightRestore === null) {
      inFlightRestore = silentRefresh().finally(() => {
        inFlightRestore = null;
        settled.value = true;
      });
    }
    return inFlightRestore;
  }

  /**
   * 注销：先让服务端吊销 refresh token，再清本地状态。
   *
   * @returns 完成即返回。
   */
  async function logout(): Promise<void> {
    await requestLogout();
    clear();
  }

  // 注册给 API 层：任意请求拿到 401 时，由这里统一续期（single-flight 在 session.ts 里）。
  registerRefreshHandler(silentRefresh);

  return { principal, settled, isAuthenticated, login, logout, ensureSession, clear };
});
