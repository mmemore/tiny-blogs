import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** 健康检查模块。刻意不依赖 TypeORM：探针不因数据库抖动而误报宕机。 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
