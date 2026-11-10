import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@tiny-blogs/shared';

/** `HttpException` 的响应体形状：与契约 §5 的错误信封保持一致。 */
export interface ApiErrorPayload {
  readonly code: ApiErrorCode;
  readonly message: string;
}

/**
 * 带业务错误码的 HTTP 异常。
 *
 * 业务代码只抛 `ApiError`，由 `AllExceptionsFilter` 统一包装成
 * `{ error: { code, message } }`，避免每个 controller 各自拼错误体。
 */
export class ApiError extends HttpException {
  readonly code: ApiErrorCode;

  /**
   * @param code 契约错误码。
   * @param message 面向调用方的说明（不得包含凭据、连接串等敏感信息）。
   * @param status HTTP 状态码。
   */
  constructor(code: ApiErrorCode, message: string, status: HttpStatus) {
    super({ code, message } satisfies ApiErrorPayload, status);
    this.code = code;
  }

  /** 404：资源不存在（草稿与不存在的 slug 都用它，避免泄漏存在性）。 */
  static notFound(message = '资源不存在'): ApiError {
    return new ApiError('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }

  /** 401：未认证或凭证无效。 */
  static unauthorized(message = '未认证或凭证已失效'): ApiError {
    return new ApiError('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }

  /** 403：已认证但无权操作。 */
  static forbidden(message = '无权操作该资源'): ApiError {
    return new ApiError('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }

  /** 422：入参校验失败。 */
  static validationFailed(message = '请求参数不合法'): ApiError {
    return new ApiError('VALIDATION_FAILED', message, HttpStatus.UNPROCESSABLE_ENTITY);
  }

  /** 409：通用冲突。 */
  static conflict(message = '资源冲突', code: ApiErrorCode = 'CONFLICT'): ApiError {
    return new ApiError(code, message, HttpStatus.CONFLICT);
  }
}
