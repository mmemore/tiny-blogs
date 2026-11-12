import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { ApiError } from './errors/api-error';

/**
 * 把 class-validator 的错误树摊平成一行中文说明。
 *
 * @param errors 校验错误树。
 * @returns 形如 `title: title 不能为空; slug: slug 格式不正确` 的说明。
 */
function flattenValidationErrors(errors: readonly ValidationError[]): string {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.constraints !== undefined) {
      for (const message of Object.values(error.constraints)) {
        messages.push(`${error.property}: ${message}`);
      }
    }
    if (error.children !== undefined && error.children.length > 0) {
      const childMessage = flattenValidationErrors(error.children);
      if (childMessage !== '') {
        messages.push(childMessage);
      }
    }
  }

  return messages.length > 0 ? messages.join('; ') : '请求参数不合法';
}

/**
 * 全局校验管道。
 *
 * 与 Nest 默认行为的唯一差别：入参校验失败返回 **422** 而不是 400
 * 错误体仍是统一信封 `{ error: { code, message } }`。
 *
 * @returns 配置好的 `ValidationPipe`。
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new ApiError('VALIDATION_FAILED', flattenValidationErrors(errors), HttpStatus.UNPROCESSABLE_ENTITY),
  });
}
