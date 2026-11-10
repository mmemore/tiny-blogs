import { Global, Module, type DynamicModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { ApiEnv } from '../../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { UserEntity } from './entities/user.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * 鉴权模块。
 *
 * `JwtModule` 与 `ThrottlerModule` 的配置都来自校验后的 `ApiEnv`（而不是 `process.env`），
 * 这样测试可以构造一份限流被调高的配置，避免用例之间互相污染。
 *
 * 标记为 global：`JwtAuthGuard` / `AuthService` 是所有受保护模块的公共依赖，
 * 各功能模块不该为了用 guard 而重复 import 一遍 JwtModule。
 */
@Global()
@Module({})
export class AuthModule {
  /**
   * @param env 校验后的配置。
   * @returns 组装好的动态模块。
   */
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      imports: [
        TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
        JwtModule.register({
          secret: env.auth.jwt.secret,
          signOptions: { expiresIn: env.auth.jwt.accessTokenTtlSeconds },
        }),
        ThrottlerModule.forRoot([
          { ttl: env.auth.loginRateWindowMs, limit: env.auth.loginRateLimit },
        ]),
      ],
      controllers: [AuthController],
      providers: [AuthService, JwtAuthGuard],
      exports: [AuthService, JwtAuthGuard],
    };
  }
}
