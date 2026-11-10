import type { Request } from 'express';
import type { Principal } from '@tiny-blogs/shared';

/**
 * 携带登录态的请求对象。
 *
 * `principal` 只由 `JwtAuthGuard` 写入；业务代码一律通过 `@CurrentPrincipal()`
 * 读取，绝不从请求体里相信调用方自报的 author。
 */
export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}
