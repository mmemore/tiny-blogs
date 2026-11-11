import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { API_PREFIX, UPLOAD_URL_PREFIX } from '@tiny-blogs/shared';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation';
import type { ApiEnv } from './config/env';

/**
 * HTTP 层装配：全局前缀、校验管道、异常过滤器，以及上传目录的静态服务。
 *
 * 抽成函数是为了让 `main.ts` 与 supertest 测试走**同一套**装配，
 * 否则"测试里 422、线上 400"这类偏差永远测不出来。
 *
 * @param app Nest 应用实例。
 * @param env 校验后的配置（需要 `UPLOAD_DIR`）。
 * @returns 同一个应用实例（便于链式调用）。
 */
export function configureApp(app: INestApplication, env: ApiEnv): INestApplication {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  configureUploadServing(app, env);
  return app;
}

/**
 * 把上传目录挂到 `/uploads` 下（注意：**不在**全局前缀 `/api` 里）。
 *
 * 安全与语义上的四个选择：
 * - `index: false`：不提供目录首页，因此无法列目录；
 * - `dotfiles: 'deny'`：`.env` 这类文件一律 403；
 * - `fallthrough: true`：文件不存在时交给 Nest 的 404，返回统一错误信封而不是 express 的 HTML；
 * - 不做任何"由请求参数拼路径"的事：静态中间件只会去根目录下找同名文件，
 *   `../` 会被规范化拦掉，我们的 key 也不可能包含它（见 `UPLOAD_KEY_PATTERN`）。
 *
 * @param app Nest 应用实例（express 适配器）。
 * @param env 校验后的配置。
 */
export function configureUploadServing(app: INestApplication, env: ApiEnv): void {
  const expressApp = app as Partial<NestExpressApplication>;
  if (typeof expressApp.useStaticAssets !== 'function') {
    // 换适配器（例如 fastify）时这里需要替换成对应的静态服务实现。
    return;
  }

  expressApp.useStaticAssets(resolve(env.upload.dir), {
    prefix: `${UPLOAD_URL_PREFIX}/`,
    index: false,
    dotfiles: 'deny',
    fallthrough: true,
    etag: true,
    maxAge: '7d',
    // 图片内容不可变（key 是内容哈希），可以放心让浏览器长时间缓存。
    immutable: true,
  });
}
