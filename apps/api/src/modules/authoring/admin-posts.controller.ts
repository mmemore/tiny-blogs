import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AdminPostDetail,
  AdminPostListItem,
  Page,
  PostRecord,
  Principal,
} from '@tiny-blogs/shared';
import { ApiError } from '../../common/errors/api-error';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthoringService } from './authoring.service';
import { AdminPostQueryDto } from './dto/admin-post-query.dto';
import { PostInputDto, UpdatePostDto } from './dto/post-input.dto';

/**
 * 后台文章接口（契约 §5「管理」）。整个控制器都在 `JwtAuthGuard` 之后，
 * 作者身份只从 `@CurrentPrincipal()` 取。
 */
@Controller('admin/posts')
@UseGuards(JwtAuthGuard)
export class AdminPostsController {
  constructor(private readonly authoring: AuthoringService) {}

  /**
   * 列表（含草稿）。
   *
   * @param query 过滤与分页。
   * @returns 分页结果。
   */
  @Get()
  list(@Query() query: AdminPostQueryDto): Promise<Page<AdminPostListItem>> {
    return this.authoring.list({
      status: query.status,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /**
   * 新建草稿。
   *
   * @param dto 文章字段。
   * @param actor 当前登录者。
   * @returns 新建的记录。
   */
  @Post()
  create(@Body() dto: PostInputDto, @CurrentPrincipal() actor: Principal): Promise<PostRecord> {
    return this.authoring.create(dto, actor);
  }

  /**
   * 编辑视图（含 Markdown 原文）。
   *
   * @param slug 文章 slug。
   * @returns 详情。
   */
  @Get(':slug')
  async detail(@Param('slug') slug: string): Promise<AdminPostDetail> {
    const detail = await this.authoring.findForEdit(slug);
    if (detail === null) {
      throw ApiError.notFound('文章不存在');
    }
    return detail;
  }

  /**
   * 更新（乐观锁）。
   *
   * @param slug 当前 slug。
   * @param dto 新字段 + `expectedUpdatedAt`。
   * @param actor 当前登录者。
   * @returns 更新后的记录。
   */
  @Put(':slug')
  update(
    @Param('slug') slug: string,
    @Body() dto: UpdatePostDto,
    @CurrentPrincipal() actor: Principal,
  ): Promise<PostRecord> {
    return this.authoring.update(slug, dto, dto.expectedUpdatedAt, actor);
  }

  /**
   * 发布（幂等）。
   *
   * @param slug 文章 slug。
   * @param actor 当前登录者。
   * @returns 发布后的记录。
   */
  @Post(':slug/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('slug') slug: string, @CurrentPrincipal() actor: Principal): Promise<PostRecord> {
    return this.authoring.publish(slug, actor);
  }

  /**
   * 取消发布（保留序号）。
   *
   * @param slug 文章 slug。
   * @param actor 当前登录者。
   * @returns 取消发布后的记录。
   */
  @Post(':slug/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('slug') slug: string, @CurrentPrincipal() actor: Principal): Promise<PostRecord> {
    return this.authoring.unpublish(slug, actor);
  }

  /**
   * 硬删。
   *
   * @param slug 文章 slug。
   * @param actor 当前登录者。
   */
  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('slug') slug: string, @CurrentPrincipal() actor: Principal): Promise<void> {
    return this.authoring.remove(slug, actor);
  }
}
