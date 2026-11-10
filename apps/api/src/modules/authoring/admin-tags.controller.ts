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
  UseGuards,
} from '@nestjs/common';
import type { TagRef } from '@tiny-blogs/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthoringService } from './authoring.service';
import { TagInputDto } from './dto/tag-input.dto';

/**
 * 后台标签接口（契约 §5「管理」）。标签量小，slug 由后台手填。
 */
@Controller('admin/tags')
@UseGuards(JwtAuthGuard)
export class AdminTagsController {
  constructor(private readonly authoring: AuthoringService) {}

  /**
   * @returns 全部标签（含尚未被使用的）。
   */
  @Get()
  list(): Promise<readonly TagRef[]> {
    return this.authoring.listTags();
  }

  /**
   * 新建标签。
   *
   * @param dto 名称与 slug。
   * @returns 新标签。
   */
  @Post()
  create(@Body() dto: TagInputDto): Promise<TagRef> {
    return this.authoring.createTag(dto);
  }

  /**
   * 改名或改 slug。
   *
   * @param slug 当前 slug。
   * @param dto 新名称与新 slug。
   * @returns 更新后的标签。
   */
  @Put(':slug')
  update(@Param('slug') slug: string, @Body() dto: TagInputDto): Promise<TagRef> {
    return this.authoring.updateTag(slug, dto);
  }

  /**
   * 删除标签（文章本身不受影响，只解除关联）。
   *
   * @param slug 标签 slug。
   */
  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('slug') slug: string): Promise<void> {
    return this.authoring.removeTag(slug);
  }
}
