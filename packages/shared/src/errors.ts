/**
 * 统一错误码。契约 §5 固定错误体为 `{ error: { code, message } }`，
 * 因此 `code` 只能是这里的取值之一。
 *
 * - `VALIDATION_FAILED`：入参不合法（HTTP 422）、以及无法归类的 4xx。
 * - `UNAUTHORIZED`：缺少/无效/过期的 access token（HTTP 401）。
 * - `INVALID_CREDENTIALS`：登录失败，不区分用户名不存在与口令错误（HTTP 401）。
 * - `REFRESH_INVALID`：refresh token 缺失、不存在或已过期（HTTP 401）。
 * - `REFRESH_REPLAYED`：检测到 refresh 重放，已撤销该用户全部会话（HTTP 401）。
 * - `FORBIDDEN`：已认证但无权操作该资源（HTTP 403）。
 * - `NOT_FOUND`：资源不存在；草稿对公开接口同样返回它（HTTP 404）。
 * - `CONFLICT`：通用冲突（HTTP 409）。
 * - `SLUG_TAKEN`：文章 slug 已被占用（HTTP 409）。
 * - `STALE_WRITE`：`expectedUpdatedAt` 与库中 `updated_at` 不一致，乐观锁拒绝覆盖（HTTP 409）。
 * - `RATE_LIMITED`：触发限流（HTTP 429）。
 * - `FILE_TOO_LARGE`：上传文件超过 `UPLOAD_MAX_BYTES`（HTTP 422）。
 * - `UNSUPPORTED_MEDIA_TYPE`：上传文件不在图片白名单内（HTTP 422）。
 * - `INTERNAL_ERROR`：未预期异常（HTTP 500）。
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'REFRESH_INVALID'
  | 'REFRESH_REPLAYED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SLUG_TAKEN'
  | 'STALE_WRITE'
  | 'RATE_LIMITED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR';

/** 统一错误响应信封。 */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
  };
}
