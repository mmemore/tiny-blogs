import { Module, type DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiConfigModule } from './config/config.module';
import type { ApiEnv } from './config/env';
import { createDataSourceOptions } from './database/data-source';
import { AuthModule } from './modules/auth/auth.module';
import { AuthoringModule } from './modules/authoring/authoring.module';
import { BuildModule } from './modules/build/build.module';
import { ContentModule } from './modules/content/content.module';
import { HealthModule } from './modules/health/health.module';
import { StorageModule } from './modules/storage/storage.module';

/**
 * 根模块。用 `forRoot(env)` 而不是在模块里读 `process.env`：
 * 配置在 `main.ts` 里一次性校验完成，模块只接受校验后的对象。
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
        TypeOrmModule.forRoot({
          ...createDataSourceOptions(env),
          // 实体由各业务模块 `forFeature` 登记，避免在这里维护一份手工清单。
          autoLoadEntities: true,
          // 测试里快速失败，比默认的重试 10 次更容易定位问题。
          retryAttempts: env.isTest ? 1 : 10,
        }),
        HealthModule,
        AuthModule.forRoot(env),
        ContentModule,
        AuthoringModule,
        BuildModule,
        StorageModule.forRoot(env),
      ],
    };
  }
}
