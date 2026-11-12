import { DataSource, type DataSourceOptions } from 'typeorm';
import { CreateBlogSchema1762760000000 } from './migrations/1762760000000-CreateBlogSchema';
import { loadEnvFile } from '../config/dotenv';
import { readApiEnv, type ApiEnv } from '../config/env';

/**
 * 由校验后的配置构造 TypeORM 连接选项。
 *
 * 纪律（ADR-0002）：
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
    // TypeORM 默认把 BIGINT 读成字符串。契约把 id 定义为 number（PostRecord.id / Principal.id），
    // 而自增主键远小于 2^53，所以这里显式关掉大数转字符串，避免 JSON 里出现 "1"。
    supportBigNumbers: false,
    bigNumberStrings: false,
    // NEVER true. 这一行是纪律，不是默认值。
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
    // 各业务模块提供实体；迁移与原生 SQL 不依赖实体元数据。
    entities: [],
    // 迁移用**显式导入**而不是 glob：glob 在直接跑 `src`（vitest / ts-node）时会把
    // `.ts` 迁移文件交给 `require()`，而 Node 20 没有内置 type stripping，会以
    // `SyntaxError: Unexpected token '{'` 失败。显式导入走模块图，两个运行时都成立，
    // 也与 `test/helpers/db.ts` 的写法保持一致。新增迁移时在这里补一行。
    migrations: [CreateBlogSchema1762760000000],
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
