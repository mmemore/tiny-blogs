import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { TAG_SLUG_PATTERN, type TagInput } from '@tiny-blogs/shared';

/** 标签写侧入参（新建与改名共用）。 */
export class TagInputDto implements TagInput {
  @IsString({ message: 'name 必须是字符串' })
  @MinLength(1, { message: 'name 不能为空' })
  @MaxLength(24, { message: 'name 不能超过 24 个字符' })
  name!: string;

  @IsString({ message: 'slug 必须是字符串' })
  @MaxLength(32, { message: 'slug 不能超过 32 个字符' })
  @Matches(TAG_SLUG_PATTERN, {
    message: 'slug 只能是小写字母、数字与连字符（例如 vue）',
  })
  slug!: string;
}
