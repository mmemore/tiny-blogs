import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@tiny-blogs/shared';

/**
 * 健康检查。唯一的公开、无鉴权、不触库的探针接口（契约 §5）。
 */
@Controller('health')
export class HealthController {
  /**
   * @returns `{ status: 'ok', uptime }`，`uptime` 为进程已运行秒数。
   */
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
    };
  }
}
