/**
 * 构建导出接口（契约 §5 `GET /api/build/export`，ADR-0004）。
 *
 * 服务对象是**发布流水线**（`pnpm release`）而不是浏览器：
 * - 鉴权用共享令牌（`X-Build-Token` ↔ `BUILD_EXPORT_TOKEN`），不走 JWT —— 构建机不是"用户"；
 * - 比较用 `timingSafeEqual`，长度不一致直接判否，避免用响应时长侧信道猜令牌；
 * - 响应头 `Cache-Control: no-store`：快照永远反映当前时刻，任何一层都不许缓存它。
 *
 * 数据**直接**来自 `ContentService.exportSnapshot()`（它已与公开查询共用投影函数），
 * 控制器不拼任何字段 —— 拼了就会出现"导出的文章详情和线上接口差一个字段"。
 */
import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { ContentSnapshot } from '@tiny-blogs/shared';
import { ENV, type ApiEnv } from '../../config/env';
import { ContentService } from '../content/content.service';

/** 请求头名：构建机与 API 之间的共享秘密载体。 */
export const BUILD_TOKEN_HEADER = 'x-build-token';

/**
 * 常数时间比较两个令牌，防止逐字节计时攻击。
 *
 * @param provided 请求带来的令牌（可能 undefined / 非字符串）。
 * @param expected 服务端配置的令牌。
 * @returns 完全一致才返回 `true`。
 */
export function verifyBuildToken(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
}

/** 构建导出控制器。 */
@Controller('build')
export class BuildExportController {
  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    private readonly content: ContentService,
  ) {}

  /**
   * 导出全量内容快照。
   *
   * @param token `X-Build-Token` 请求头。
   * @returns `ContentSnapshot`（含每篇已发布文章的 Markdown 原文）。
   * @throws {UnauthorizedException} 令牌缺失或不正确。
   */
  @Get('export')
  @Header('Cache-Control', 'no-store')
  export(@Headers(BUILD_TOKEN_HEADER) token: string | undefined): Promise<ContentSnapshot> {
    if (!verifyBuildToken(token, this.env.buildExport.token)) {
      // 统一错误信封由全局过滤器包装；文案不区分"缺失"与"错误"，不给试探者额外信息。
      throw new UnauthorizedException('构建令牌缺失或不正确');
    }
    return this.content.exportSnapshot();
  }
}
