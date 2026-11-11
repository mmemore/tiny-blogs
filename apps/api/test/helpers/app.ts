/**
 * 测试应用工厂：起一个完整 Nest 应用（不监听端口），supertest 直接打 HTTP 边界。
 *
 * 与 `main.ts` 共用 `configureApp`，所以全局前缀、校验管道（422）、错误信封
 * 在测试里与线上完全一致。
 */
import { NestFactory } from '@nestjs/core';
import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import type { ApiEnv } from '../../src/config/env';
import { createTestEnv } from './env';
import { migrateTestDatabase } from './db';

/** 一次测试需要的上下文。 */
export interface TestContext {
  readonly app: INestApplication;
  readonly dataSource: DataSource;
  readonly env: ApiEnv;
}

/**
 * 启动测试应用。
 *
 * @param overrides 覆盖的环境变量（例如调低限流）。
 * @returns 应用、数据源与配置。
 */
export async function createTestApp(
  overrides: Readonly<Record<string, string>> = {},
): Promise<TestContext> {
  const env = createTestEnv(overrides);

  // 先确保 schema 就绪，再启动应用（应用启动后立刻会连库）。
  await migrateTestDatabase(env);

  const options: NestApplicationOptions = { logger: ['error'] };
  const app = await NestFactory.create(AppModule.forRoot(env), options);
  configureApp(app, env);
  await app.init();

  return { app, dataSource: app.get(DataSource), env };
}

/**
 * 关闭测试应用（含数据库连接）。
 *
 * @param context 测试上下文。
 */
export async function closeTestApp(context: TestContext): Promise<void> {
  await context.app.close();
}
