import { join } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { loadEnvFile } from '../config/dotenv';
import { readApiEnv, type ApiEnv } from '../config/env';

/**
 * 由校验后的配置构造 TypeORM 连接选项。
 *
 * 纪律（ADR-0002，票 02 验收项）：
 * - `synchronize` 永远是 `false`，schema 只经 migration 变更；
 * - `migrationsRun` 同样是 `false`，迁移必须显式执行（`pnpm migration:run`），
 *   避免应用启动时隐式改结构；
 * - 实体会随业务模块逐个登记，本文件保持"只有连接与迁移"的职责。
 *
 * @param env 校验后的 API 配置。
 * @returns TypeORM 数据源选项。
 */
export function createDataSourceOptions(env: ApiEnv): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.database.host,
    port: env.database.port,
    username: env.database.user,
    password: env.database.password,
    database: env.database.name,
    charset: 'utf8mb4',
    // 表里的 datetime 语义是 UTC；驱动层负责与 JS Date 互转。
    timezone: 'Z',
    // NEVER true. 这一行是纪律，不是默认值。
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
    // 票 03 起由各业务模块提供实体；迁移与原生 SQL 不依赖实体元数据。
    entities: [],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations',
  };
}

/**
 * 构造一个未初始化的数据源（供 CLI 脚本使用）。
 *
 * 会先加载仓库根目录的 `.env`，再校验环境变量。
 *
 * @returns 未初始化的 `DataSource`，调用方负责 `initialize()` / `destroy()`。
 */
export function createAppDataSource(): DataSource {
  loadEnvFile();
  return new DataSource(createDataSourceOptions(readApiEnv()));
}
