import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TAG_SLUG_PATTERN,
  type ListQuery,
} from '@tiny-blogs/shared';

/**
 * 公开列表查询参数（契约 §5 `GET /api/posts`）。
 *
 * 与后台 DTO 的差别是默认值与上限：前台每页 8 条、最多 24 条，
 * 这是个会被人手改 URL 的公开接口，上限必须有。
 *
 * `year` 与 `month` 可单独使用：带 `year` 时 `month` 收窄到该月；
 * 只给 `month` 时按"每年这个月"过滤（跨年份看某月）。
 */
export class ListPostsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize 最大为 ${String(MAX_PAGE_SIZE)}` })
  pageSize: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString({ message: 'tag 必须是字符串' })
  @Matches(TAG_SLUG_PATTERN, { message: 'tag 必须是标签 slug（小写字母、数字与连字符）' })
  tag?: string;

  @IsOptional()
  @IsString({ message: 'q 必须是字符串' })
  @MaxLength(120, { message: 'q 不能超过 120 个字符' })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'year 必须是整数' })
  @Min(1970, { message: 'year 最小为 1970' })
  @Max(9999, { message: 'year 最大为 9999' })
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'month 必须是整数' })
  @Min(1, { message: 'month 必须在 1..12 之间' })
  @Max(12, { message: 'month 必须在 1..12 之间' })
  month?: number;

  /**
   * 转成 shared 的查询条件。
   *
   * @returns 只含已设字段的 `ListQuery`（可选字段保持 `undefined`，便于服务层判断）。
   */
  toListQuery(): ListQuery {
    return {
      page: this.page,
      pageSize: this.pageSize,
      tag: this.tag,
      q: this.q,
      year: this.year,
      month: this.month,
    };
  }
}
