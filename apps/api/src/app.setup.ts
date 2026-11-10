import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@tiny-blogs/shared';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation';

/**
 * HTTP 层装配：全局前缀、校验管道、异常过滤器。
 *
 * 抽成函数是为了让 `main.ts` 与 supertest 测试走**同一套**装配，
 * 否则"测试里 422、线上 400"这类偏差永远测不出来。
 *
 * @param app Nest 应用实例。
 * @returns 同一个应用实例（便于链式调用）。
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  return app;
}
