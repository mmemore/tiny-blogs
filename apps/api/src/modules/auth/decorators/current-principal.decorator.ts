import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '@tiny-blogs/shared';
import { ApiError } from '../../../common/errors/api-error';
import type { AuthenticatedRequest } from '../authenticated-request';

/**
 * 取出当前登录者（由 `JwtAuthGuard` 写入）。
 *
 * 少了 guard 就抛 401，而不是返回 undefined —— 免得业务代码在"忘了加 guard"时
 * 静默地以匿名身份跑下去。
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (principal === undefined) {
      throw ApiError.unauthorized('缺少登录态');
    }
    return principal;
  },
);
