/**
 * API 访问层：统一 base、统一错误、统一 JSON 解析。
 *
 * 纪律（ADR-0005）：浏览器端**永远**用同源 `/api`（dev 交给 Vite 代理，生产交给反向代理），
 * 因此不需要给 API 开 CORS；预渲染在 Node 里跑，没有"同源"，才回落到 `VITE_API_BASE` 的绝对地址。
 */
import { API_PREFIX, type ErrorEnvelope } from '@tiny-blogs/shared';

/** API 返回的业务错误（携带 HTTP 状态码，页面据此区分 404 与其它失败）。 */
export class ApiRequestError extends Error {
  readonly status: number;

  readonly code: string;

  /**
   * @param status HTTP 状态码。
   * @param code 统一错误码（`ApiErrorCode`）。
   * @param message 可直接展示的说明。
   */
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 解析 API 根地址。
 *
 * @returns 浏览器端为 `/api`；预渲染（Node）为绝对地址。
 */
function resolveApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE ?? '').trim().replace(/\/$/, '');
  if (import.meta.env.SSR) {
    return configured === '' ? `http://127.0.0.1:3000/${API_PREFIX}` : configured;
  }
  return `/${API_PREFIX}`;
}

/** API 根地址（相对或绝对，取决于运行环境）。 */
export const apiBase = resolveApiBase();

/** 查询参数表：`undefined` / 空串会被丢弃，避免拼出 `?q=` 这种无意义参数。 */
export type QueryParams = Readonly<Record<string, string | number | undefined>>;

/**
 * 拼出完整请求地址。
 *
 * @param path 以 `/` 开头的路径（不含 `/api` 前缀）。
 * @param params 查询参数。
 * @returns 可直接 fetch 的绝对 URL。
 */
function buildUrl(path: string, params: QueryParams = {}): string {
  const origin = import.meta.env.SSR ? 'http://localhost' : window.location.origin;
  const url = new URL(`${apiBase}${path}`, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * 发一个 GET 请求并解析 JSON。
 *
 * @param path 以 `/` 开头的路径。
 * @param params 查询参数。
 * @returns 解析后的响应体。
 * @throws {ApiRequestError} HTTP 非 2xx，或响应体不是 JSON。
 */
export async function apiGet<T>(path: string, params: QueryParams = {}): Promise<T> {
  const response = await fetch(buildUrl(path, params), {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const envelope = (await response.json().catch(() => null)) as ErrorEnvelope | null;
    throw new ApiRequestError(
      response.status,
      envelope?.error.code ?? 'INTERNAL_ERROR',
      envelope?.error.message ?? `请求失败（HTTP ${String(response.status)}）`,
    );
  }

  return (await response.json()) as T;
}
