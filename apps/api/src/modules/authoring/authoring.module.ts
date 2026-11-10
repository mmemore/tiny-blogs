import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from '../content/entities/post.entity';
import { TagEntity } from '../content/entities/tag.entity';
import { AdminPostsController } from './admin-posts.controller';
import { AdminTagsController } from './admin-tags.controller';
import { AuthoringService } from './authoring.service';

/**
 * 写侧模块（后台专用）。`JwtAuthGuard` 来自被标记为 global 的 `AuthModule`，
 * 因此这里不需要（也不应该）重复注册鉴权依赖。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PostEntity, TagEntity])],
  controllers: [AdminPostsController, AdminTagsController],
  providers: [AuthoringService],
  exports: [AuthoringService],
})
export class AuthoringModule {}
