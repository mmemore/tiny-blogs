import { Controller, Get, Param, Query } from '@nestjs/common';
import type {
  ArchiveYear,
  Page,
  PostDetail,
  PostSummary,
  TagWithCount,
} from '@tiny-blogs/shared';
import { ApiError } from '../../common/errors/api-error';
import { ContentService } from './content.service';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

/**
 * 公开读侧接口（契约 §5「公开」）。全部无需鉴权，也**不接受**任何 `status` 参数：
 * 已发布这一不变量由 `ContentService` 内部保证。
 */
@Controller()
export class PublicContentController {
  constructor(private readonly content: ContentService) {}

  /**
   * 文章列表。
   *
   * @param query 分页与过滤条件。
   * @returns 分页结果。
   */
  @Get('posts')
  list(@Query() query: ListPostsQueryDto): Promise<Page<PostSummary>> {
    return this.content.listPublished(query.toListQuery());
  }

  /**
   * 文章详情。草稿与不存在的 slug 走同一条 404，错误体完全一致。
   *
   * @param slug 文章 slug。
   * @returns 详情。
   */
  @Get('posts/:slug')
  async detail(@Param('slug') slug: string): Promise<PostDetail> {
    const detail = await this.content.findPublished(slug);
    if (detail === null) {
      throw ApiError.notFound('文章不存在');
    }
    return detail;
  }

  /**
   * 标签及已发布文章数。
   *
   * @returns 标签列表。
   */
  @Get('tags')
  tags(): Promise<TagWithCount[]> {
    return this.content.listTags();
  }

  /**
   * 年月归档。
   *
   * @returns 归档树。
   */
  @Get('archives')
  archives(): Promise<ArchiveYear[]> {
    return this.content.getArchive();
  }
}
