/**
 * API 访问层：统一 base、统一错误、统一 JSON 解析、统一鉴权重放。
 *
 * 纪律（ADR-0005）：浏览器端**永远**用同源 `/api`（dev 交给 Vite 代理，生产交给反向代理），
 * 因此不需要给 API 开 CORS；预渲染在 Node 里跑，没有"同源"，才回落到 `VITE_API_BASE` 的绝对地址。
 *
 * 会话纪律（ADR-0003）：
 * - access token 只从 `api/session.ts` 的内存里取，本文件不碰任何存储 API；
 * - 每个请求都带 `credentials: 'include'`，refresh token 由浏览器以 httpOnly cookie 携带，
 *   JS 既读不到也写不了；
 * - 401 时最多重放**一次**：先尝试静默刷新，成功则用新 token 重放原请求，失败则判定会话失效。
 */
import { API_PREFIX, type ErrorEnvelope } from '@tiny-blogs/shared';
import { getAccessToken, notifySessionExpired, refreshSession } from './session';

/** API 返回的业务错误（携带 HTTP 状态码与契约错误码，页面据此分支处理）。 */
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

/** 单个请求的选项。 */
export interface RequestOptions {
  /** 查询参数。 */
  readonly params?: QueryParams;
  /** JSON 请求体（会自动带上 `content-type`）。 */
  readonly json?: unknown;
  /** 原样发送的请求体（`FormData` 等，不自动设置 `content-type`）。 */
  readonly body?: BodyInit;
  /** 额外的请求头。 */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * 是否允许"401 → 刷新 → 重放一次"。
   *
   * 默认允许；刷新接口自身、登录接口必须传 `false`，否则会绕成环。
   */
  readonly authRetry?: boolean;
}

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
 * 把错误响应解析成 `ApiRequestError`。
 *
 * @param response 非 2xx 的响应。
 * @returns 带契约错误码的异常对象。
 */
async function toRequestError(response: Response): Promise<ApiRequestError> {
  const envelope = (await response.json().catch(() => null)) as ErrorEnvelope | null;
  return new ApiRequestError(
    response.status,
    envelope?.error.code ?? 'INTERNAL_ERROR',
    envelope?.error.message ?? `请求失败（HTTP ${String(response.status)}）`,
  );
}

/**
 * 发一次请求（不带任何重试）。
 *
 * @param method HTTP 方法。
 * @param path 以 `/` 开头的路径。
 * @param options 请求选项。
 * @returns 原始响应。
 */
async function sendOnce(method: string, path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  const token = getAccessToken();
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined = options.body;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  return fetch(buildUrl(path, options.params ?? {}), {
    method,
    headers,
    body,
    // refresh / 登出都靠 cookie，必须始终带上（同源请求，不算跨站）。
    credentials: 'include',
  });
}

/**
 * 发请求并解析响应体，必要时刷新会话并重放一次。
 *
 * @param method HTTP 方法。
 * @param path 以 `/` 开头的路径。
 * @param options 请求选项。
 * @returns 解析后的响应体（204 为 `undefined`）。
 * @throws {ApiRequestError} HTTP 非 2xx。
 */
async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const allowRetry = options.authRetry ?? true;
  const first = await sendOnce(method, path, options);
  if (first.ok) {
    return (await parseBody<T>(first)) as T;
  }

  const error = await toRequestError(first);

  // 只有"本来就有会话"的 401 才值得刷新：
  // 登录接口的 401（INVALID_CREDENTIALS）与"从未登录"的 401 都应当直接抛给调用方。
  const canRecover =
    allowRetry &&
    error.status === 401 &&
    error.code !== 'INVALID_CREDENTIALS' &&
    getAccessToken() !== null;

  if (!canRecover) {
    throw error;
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    notifySessionExpired();
    throw error;
  }

  // 只重放一次：第二次仍是 401，说明刷新拿到的 token 也不被接受，不再继续。
  const replay = await sendOnce(method, path, options);
  if (replay.ok) {
    return (await parseBody<T>(replay)) as T;
  }

  const replayError = await toRequestError(replay);
  if (replayError.status === 401) {
    notifySessionExpired();
  }
  throw replayError;
}

/**
 * 解析响应体（204 与空响应返回 `undefined`）。
 *
 * @param response 成功的响应。
 * @returns 解析后的值。
 */
async function parseBody<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (text === '') {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiRequestError(response.status, 'INTERNAL_ERROR', '响应不是合法的 JSON');
  }
}

/**
 * 发一个 GET 请求并解析 JSON。
 *
 * @param path 以 `/` 开头的路径。
 * @param params 查询参数。
 * @param options 额外选项（例如会话校验时关掉自动重放）。
 * @returns 解析后的响应体。
 * @throws {ApiRequestError} HTTP 非 2xx，或响应体不是 JSON。
 */
export function apiGet<T>(path: string, params: QueryParams = {}, options: RequestOptions = {}): Promise<T> {
  return request<T>('GET', path, { ...options, params });
}

/**
 * 发一个 POST 请求。
 *
 * @param path 以 `/` 开头的路径。
 * @param json 请求体（`undefined` 表示无请求体）。
 * @param options 额外选项。
 * @returns 解析后的响应体。
 */
export function apiPost<T>(path: string, json?: unknown, options: RequestOptions = {}): Promise<T> {
  return request<T>('POST', path, { ...options, json });
}

/**
 * 发一个 PUT 请求。
 *
 * @param path 以 `/` 开头的路径。
 * @param json 请求体。
 * @param options 额外选项。
 * @returns 解析后的响应体。
 */
export function apiPut<T>(path: string, json?: unknown, options: RequestOptions = {}): Promise<T> {
  return request<T>('PUT', path, { ...options, json });
}

/**
 * 发一个 DELETE 请求。
 *
 * @param path 以 `/` 开头的路径。
 * @param options 额外选项。
 * @returns 解析后的响应体（204 时为 `undefined`）。
 */
export function apiDelete<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>('DELETE', path, options);
}

/**
 * 上传一个文件（multipart，字段名固定为 `file`，契约 §5）。
 *
 * 不设置 `content-type`：交给浏览器自动带上 multipart 的 boundary。
 *
 * @param path 以 `/` 开头的路径（如 `/admin/upload`）。
 * @param file 浏览器 `File` 对象。
 * @returns 解析后的响应体。
 */
export function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file, file.name);
  return request<T>('POST', path, { body: form });
}
