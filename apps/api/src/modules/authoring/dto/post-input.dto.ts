import {
  IsArray,
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ArrayMaxSize,
} from 'class-validator';
import { POST_SLUG_PATTERN, type PostInput } from '@tiny-blogs/shared';

/** 一篇文章最多挂多少个标签（防止误粘贴整段列表）。 */
const MAX_TAGS_PER_POST = 20;

/**
 * 文章写侧入参（新建与更新共用）。
 *
 * 作者身份不在这里：它来自登录态，DTO 里出现 `authorId` 会被
 * `forbidNonWhitelisted` 直接 422 拒掉。
 */
export class PostInputDto implements PostInput {
  @IsString({ message: 'title 必须是字符串' })
  @MinLength(1, { message: 'title 不能为空' })
  @MaxLength(120, { message: 'title 不能超过 120 个字符' })
  title!: string;

  @IsString({ message: 'slug 必须是字符串' })
  @MaxLength(140, { message: 'slug 不能超过 140 个字符' })
  @Matches(POST_SLUG_PATTERN, {
    message: 'slug 只能是小写字母、数字与连字符（例如 hello-world）',
  })
  slug!: string;

  @IsString({ message: 'summary 必须是字符串' })
  @MinLength(1, { message: 'summary 不能为空' })
  @MaxLength(200, { message: 'summary 不能超过 200 个字符' })
  summary!: string;

  @IsString({ message: 'contentMd 必须是字符串' })
  contentMd!: string;

  @IsArray({ message: 'tagSlugs 必须是数组' })
  @ArrayMaxSize(MAX_TAGS_PER_POST, { message: `标签不能超过 ${MAX_TAGS_PER_POST} 个` })
  @IsString({ each: true, message: 'tagSlugs 的每一项都必须是字符串' })
  tagSlugs!: string[];
}

/** 更新入参：在写侧字段之外加上乐观锁版本。 */
export class UpdatePostDto extends PostInputDto {
  @IsISO8601(
    { strict: false },
    { message: 'expectedUpdatedAt 必须是 ISO 8601 时间（取自上次读取的 updatedAt）' },
  )
  expectedUpdatedAt!: string;
}
