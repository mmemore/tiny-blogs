import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ApiError } from '../../../common/errors/api-error';
import type { AuthenticatedRequest } from '../authenticated-request';
import { AuthService } from '../auth.service';
import { extractBearerToken } from '../tokens';

/**
 * 校验 `Authorization: Bearer <access>`，并把操作者挂到请求上。
 *
 * 校验包含 `ver`（token_version）比对，因此提升 `token_version` 会让该用户
 * 所有已签发的 access 立刻失效（强制下线）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  /**
   * @param context 当前请求上下文。
   * @returns 校验通过恒为 true（失败抛 401）。
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (token === null) {
      throw ApiError.unauthorized('缺少 Bearer access token');
    }

    request.principal = await this.auth.verify(token);
    return true;
  }
}
