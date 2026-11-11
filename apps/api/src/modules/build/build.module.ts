/**
 * 构建导出模块。
 *
 * 独立成一个模块而不是塞进 `ContentModule`：鉴权方式完全不同
 * （共享令牌 vs 无鉴权 vs JWT），三者分开才能一眼看出"哪个端点给谁用"。
 * `ContentModule` 已经 `exports: [ContentService]`，这里直接复用。
 */
import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { BuildExportController } from './build-export.controller';

/** 构建导出模块。 */
@Module({
  imports: [ContentModule],
  controllers: [BuildExportController],
})
export class BuildModule {}
