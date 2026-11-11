/**
 * 存储模块。
 *
 * 用 `forRoot(env)` 而不是在模块里读 `process.env`：目录与上限来自 `main.ts` 已校验的那份配置，
 * 测试也能给出一份指向临时目录的配置，不需要动环境变量。
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import type { ApiEnv } from '../../config/env';
import { AdminUploadController } from './admin-upload.controller';
import { LocalDiskStorage } from './local-disk.storage';
import { STORAGE } from './storage.service';

/** 存储模块。 */
@Module({})
export class StorageModule {
  /**
   * @param env 校验后的配置（`UPLOAD_DIR` / `UPLOAD_MAX_BYTES`）。
   * @returns 组装好的动态模块。
   */
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: StorageModule,
      imports: [
        // 给 `FileInterceptor` 一个全局默认上限：超限的请求在进入控制器前就被 multer 掐断，
        // 不会把 5MB 以上的字节先读进内存。`AllExceptionsFilter` 把 `LIMIT_FILE_SIZE`
        // 翻译成 422 `FILE_TOO_LARGE`，与存储层的拒绝理由保持同一个契约错误码。
        //
        // 为什么 `+ 1`：底层 busboy 的语义是 `fileSize >= fileSizeLimit` 即触发 `limit`，
        // 恰好等于 `UPLOAD_MAX_BYTES` 的合法文件（契约 §4.5 是"≤上限"）会在这里被误拦。
        // 放宽 1 字节让"恰好等于上限"的文件能到达存储层，由 `storage.service` 的
        // `> maxBytes`（严格大于）做权威判定——两层语义就此对齐。不要把 +1"优化"回去。
        MulterModule.registerAsync({
          useFactory: () => ({
            limits: { fileSize: env.upload.maxBytes + 1, files: 1, fields: 8 },
          }),
        }),
      ],
      controllers: [AdminUploadController],
      providers: [
        {
          provide: STORAGE,
          // 目录在这里一次性解析成绝对路径：后续所有写盘都基于它，不再拼用户输入。
          useFactory: () =>
            new LocalDiskStorage({
              dir: resolve(env.upload.dir),
              maxBytes: env.upload.maxBytes,
            }),
        },
      ],
      exports: [STORAGE],
    };
  }
}
