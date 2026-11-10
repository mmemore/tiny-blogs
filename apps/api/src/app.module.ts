import { Module, type DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiConfigModule } from './config/config.module';
import type { ApiEnv } from './config/env';
import { createDataSourceOptions } from './database/data-source';
import { HealthModule } from './modules/health/health.module';

/**
 * 根模块。用 `forRoot(env)` 而不是在模块里读 `process.env`：
 * 配置在 `main.ts` 里一次性校验完成，模块只接受校验后的对象。
 *
 * 后续票（03 鉴权、04 写侧、05 读侧）在这里追加 `AuthModule` / `AdminModule` / `ContentModule`。
 */
@Module({})
export class AppModule {
  /**
   * @param env `readApiEnv()` 的产物。
   * @returns 组装好的动态模块。
   */
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ApiConfigModule.forRoot(env),
        TypeOrmModule.forRoot(createDataSourceOptions(env)),
        HealthModule,
      ],
    };
  }
}
