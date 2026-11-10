/**
 * 前后端共享的契约层：常量、联合类型与纯函数。
 *
 * 纪律（见 `docs/design/fields-and-interfaces.md` §4.1、ADR-0005）：
 * - 本包不得引入 Node-only 或浏览器-only 依赖，必须能在预渲染（Node）与浏览器两侧求值。
 * - 派生规则（曲目号、阅读时长等）只在这里实现一次，禁止两端各写一份。
 * - 术语以 `GLOSSARY.md` 为准：Post / Tag / Archive / Admin，禁止出现 article/vinyl/record 命名。
 */

/** HTTP 层统一前缀。Nest 的 `setGlobalPrefix` 与前端请求路径共用这一个常量。 */
export const API_PREFIX = 'api';

/** 文章状态。与数据库 `posts.status` 的 enum 取值一一对应（契约 §2）。 */
export const POST_STATUS = {
  draft: 'draft',
  published: 'published',
} as const;

/** 文章状态联合类型。 */
export type PostStatus = (typeof POST_STATUS)[keyof typeof POST_STATUS];

/** 全部文章状态，供枚举校验与后台筛选复用。 */
export const POST_STATUSES: readonly PostStatus[] = [POST_STATUS.draft, POST_STATUS.published];

/**
 * 判断任意值是否为合法的文章状态。
 *
 * @param value 待判断的值。
 * @returns 命中 `draft` / `published` 时为 true。
 */
export function isPostStatus(value: unknown): value is PostStatus {
  return value === POST_STATUS.draft || value === POST_STATUS.published;
}

/**
 * 统一错误码。契约 §5 固定错误体为 `{ error: { code, message } }`，
 * 因此 `code` 只能是这里的取值之一。
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

/** 统一错误响应信封。 */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
  };
}

/**
 * `GET /api/health` 的响应体。
 * `uptime` 为进程已运行秒数（整数）。
 */
export interface HealthResponse {
  readonly status: 'ok';
  readonly uptime: number;
}
