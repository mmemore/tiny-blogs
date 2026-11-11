/**
 * 上传接口（契约 §5 `POST /api/admin/upload`）。
 *
 * 三个约束：
 * - 整个控制器在 `JwtAuthGuard` 之后：v1 只有一个管理员，"登录即可"就是归属校验；
 * - 大小与类型判定都在存储层（`BaseStorage`），控制器只负责把 multipart 拆出来，
 *   这样 HTTP 层与适配器层的拒绝理由不可能不一致；
 * - 返回的 `url` 是站内相对路径，前端可以直接写进 Markdown，换域名不用改正文。
 */
import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadResult } from '@tiny-blogs/shared';
import { ApiError } from '../../common/errors/api-error';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { STORAGE, type StorageService } from './storage.service';

/**
 * multer 传进来的文件对象。
 *
 * 不直接引 `Express.Multer.File`：`@types/multer` 不是本项目的直接依赖
 * （它只是 `@nestjs/platform-express` 的传递依赖），pnpm 的严格布局下拿不到类型。
 * 这里只需要三个字段，显式声明比隐式 any 好。
 */
interface UploadedFileLike {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

/** 后台上传控制器。 */
@Controller('admin/upload')
@UseGuards(JwtAuthGuard)
export class AdminUploadController {
  constructor(@Inject(STORAGE) private readonly storage: StorageService) {}

  /**
   * 上传一张图片。
   *
   * @param file multipart 字段 `file`。
   * @returns `{ key, url }`。
   * @throws {ApiError} 缺字段 422；超限 422 `FILE_TOO_LARGE`；类型不符 422 `UNSUPPORTED_MEDIA_TYPE`。
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedFileLike | undefined): Promise<UploadResult> {
    if (file === undefined) {
      throw ApiError.validationFailed('缺少 multipart 字段 file');
    }
    // `file.mimetype` 由客户端决定，存储层不看它，只看字节。
    return this.storage.put({ content: file.buffer, mime: file.mimetype, size: file.size });
  }
}
