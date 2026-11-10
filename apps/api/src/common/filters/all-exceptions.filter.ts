import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorCode, ErrorEnvelope } from '@tiny-blogs/shared';

/** HTTP 状态码 → 契约错误码。未列出的 4xx 一律按入参问题处理。 */
const STATUS_TO_CODE: Readonly<Record<number, ApiErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

/** 5xx 对外统一文案：不把内部实现、SQL、连接串泄漏给调用方。 */
const INTERNAL_ERROR_MESSAGE = '服务器内部错误';

interface MaybeApiPayload {
  readonly code?: unknown;
  readonly message?: unknown;
}

/**
 * 全局异常过滤器：把所有异常收敛成 `{ error: { code, message } }`（契约 §5）。
 *
 * 安全约束：只记录 5xx 的堆栈，不记录请求体/cookie/连接串。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * @param exception 抛出的任意异常。
   * @param host 当前请求上下文。
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const detail = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
      this.logger.error(`未处理异常（${status}）`, detail);
    }

    const envelope: ErrorEnvelope = {
      error: {
        code: this.resolveCode(status, exception),
        message: this.resolveMessage(status, exception),
      },
    };

    response.status(status).json(envelope);
  }

  /**
   * @param status HTTP 状态码。
   * @param exception 原始异常。
   * @returns 契约错误码。
   */
  private resolveCode(status: number, exception: unknown): ApiErrorCode {
    const payload = this.extractPayload(exception);
    if (typeof payload?.code === 'string') {
      return payload.code as ApiErrorCode;
    }
    const mapped = STATUS_TO_CODE[status];
    if (mapped !== undefined) {
      return mapped;
    }
    return status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
  }

  /**
   * @param status HTTP 状态码。
   * @param exception 原始异常。
   * @returns 对外展示的错误说明。
   */
  private resolveMessage(status: number, exception: unknown): string {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return INTERNAL_ERROR_MESSAGE;
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      // ThrottlerException 自带的英文文案（"ThrottlerException: Too Many Requests"）不适合直接外露。
      return '请求过于频繁，请稍后再试';
    }

    const payload = this.extractPayload(exception);
    if (payload !== undefined) {
      if (typeof payload.message === 'string' && payload.message !== '') {
        return payload.message;
      }
      if (Array.isArray(payload.message)) {
        return payload.message.map(String).join('; ');
      }
    }

    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      if (typeof raw === 'string' && raw !== '') {
        return raw;
      }
      return exception.message;
    }

    return INTERNAL_ERROR_MESSAGE;
  }

  /**
   * 取出 `HttpException` 的结构化响应体（可能不存在）。
   *
   * @param exception 原始异常。
   * @returns 响应体对象或 `undefined`。
   */
  private extractPayload(exception: unknown): MaybeApiPayload | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }
    const raw = exception.getResponse();
    return typeof raw === 'object' && raw !== null ? (raw as MaybeApiPayload) : undefined;
  }
}
