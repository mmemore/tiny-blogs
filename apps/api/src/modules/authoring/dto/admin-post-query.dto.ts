import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { PostStatus } from '@tiny-blogs/shared';

/** 后台文章列表的默认分页大小。 */
export const ADMIN_DEFAULT_PAGE_SIZE = 20;

/**
 * 后台文章列表查询参数。
 *
 * `transform: true` 下由 class-transformer 实例化，缺省值来自字段初始值；
 * `@Type(() => Number)` 负责把 query string 转成数字。
 */
export class AdminPostQueryDto {
  @IsOptional()
  @IsIn(['draft', 'published'], { message: 'status 只能是 draft 或 published' })
  status?: PostStatus;

  @IsOptional()
  @IsString({ message: 'q 必须是字符串' })
  @MaxLength(120, { message: 'q 不能超过 120 个字符' })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(100, { message: 'pageSize 最大为 100' })
  pageSize: number = ADMIN_DEFAULT_PAGE_SIZE;
}
