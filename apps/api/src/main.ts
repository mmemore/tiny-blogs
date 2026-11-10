import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@tiny-blogs/shared';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadEnvFile } from './config/dotenv';
import { EnvValidationError, readApiEnv } from './config/env';

/**
 * 启动流程（顺序即约束）：
 * 1. 加载 `.env`（不存在则忽略，视作由真实环境变量注入）；
 * 2. 校验环境变量 —— 缺失必需项立刻失败，错误信息只含变量名；
 * 3. 建 Nest 应用并挂全局前缀 / 校验管道 / 异常过滤器；
 * 4. 监听端口。
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const envFile = loadEnvFile();
  if (envFile !== null) {
    logger.log(`已加载环境变量文件：${envFile}`);
  }

  // 校验失败会抛 EnvValidationError，由下面的 catch 打印并退出。
  const env = readApiEnv();

  const app = await NestFactory.create(AppModule.forRoot(env));
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(env.apiPort);
  logger.log(`API 已启动：http://127.0.0.1:${env.apiPort}/${API_PREFIX}（${env.nodeEnv}）`);
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  if (error instanceof EnvValidationError) {
    logger.error(error.message);
  } else if (error instanceof Error) {
    logger.error(`API 启动失败：${error.message}`, error.stack);
  } else {
    logger.error('API 启动失败：未知错误');
  }
  // fail-fast：不带着错误配置继续运行。
  process.exit(1);
});
