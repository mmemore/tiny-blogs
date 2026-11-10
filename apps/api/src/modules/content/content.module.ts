import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { ContentService } from './content.service';
import { PublicContentController } from './public-content.controller';

/**
 * 读侧模块（公开）。导出 `ContentService` 是为了让票 10 的构建导出（`/api/build/export`）
 * 复用同一份快照与投影，而不是再写一套查询。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PostEntity])],
  controllers: [PublicContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
