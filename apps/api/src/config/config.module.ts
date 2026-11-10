import { Global, Module, type DynamicModule } from '@nestjs/common';
import { ENV, type ApiEnv } from './env';

/**
 * 把校验后的配置注册为全局 provider，后续模块用
 * `@Inject(ENV) private readonly env: ApiEnv` 取用，避免各处重复读 `process.env`。
 */
@Global()
@Module({})
export class ApiConfigModule {
  /**
   * @param env `readApiEnv()` 的产物。
   * @returns 带全局 `ENV` provider 的动态模块。
   */
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: ApiConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
