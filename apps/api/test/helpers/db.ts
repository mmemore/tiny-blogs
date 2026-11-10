/**
 * 测试数据库工具：跑迁移、清表、造 fixture。
 *
 * 迁移用**显式导入的迁移类**而不是 data-source 里的 glob：
 * 测试运行在 vite/vitest 的转译环境里，动态 `require` 一个 .ts 文件不可靠。
 */
import { DataSource } from 'typeorm';
import { hashPassword } from '../../src/common/password';
import type { ApiEnv } from '../../src/config/env';
import { createDataSourceOptions } from '../../src/database/data-source';
import { CreateBlogSchema1762760000000 } from '../../src/database/migrations/1762760000000-CreateBlogSchema';

/** 清库时按外键依赖的逆序处理（同时关闭外键检查）。 */
const TABLES = ['post_tags', 'posts', 'tags', 'refresh_tokens', 'users'] as const;

/** 测试账号 fixture。 */
export interface SeededUser {
  readonly id: number;
  readonly username: string;
  readonly password: string;
}

/**
 * 建一个只用于跑迁移的临时数据源。
 *
 * @param env 测试配置。
 * @returns 已初始化的数据源。
 */
async function openMigrationDataSource(env: ApiEnv): Promise<DataSource> {
  const dataSource = new DataSource({
    ...createDataSourceOptions(env),
    entities: [],
    migrations: [CreateBlogSchema1762760000000],
  });
  await dataSource.initialize();
  return dataSource;
}

/**
 * 把测试库升到最新 schema（幂等）。
 *
 * @param env 测试配置。
 */
export async function migrateTestDatabase(env: ApiEnv): Promise<void> {
  const dataSource = await openMigrationDataSource(env);
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

/**
 * 清空全部业务表（保留 schema 与迁移记录）。
 *
 * @param dataSource 应用使用的数据源。
 */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of TABLES) {
      await dataSource.query(`TRUNCATE TABLE \`${table}\``);
    }
  } finally {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

/**
 * 直接插入一个账号（绕过 HTTP，避免用登录接口造数据）。
 *
 * @param dataSource 应用使用的数据源。
 * @param username 登录名。
 * @param password 明文口令（写入前 argon2id 哈希）。
 * @returns 账号 fixture。
 */
export async function createUser(
  dataSource: DataSource,
  username: string,
  password: string,
): Promise<SeededUser> {
  const passwordHash = await hashPassword(password);
  const result = (await dataSource.query(
    'INSERT INTO users (username, password_hash, token_version) VALUES (?, ?, 0)',
    [username, passwordHash],
  )) as { insertId: number };

  return { id: result.insertId, username, password };
}

/**
 * 读某账号当前的 `token_version`（用于断言强制下线）。
 *
 * @param dataSource 应用使用的数据源。
 * @param userId 账号 id。
 * @returns 当前值。
 */
export async function getTokenVersion(dataSource: DataSource, userId: number): Promise<number> {
  const rows = (await dataSource.query('SELECT token_version FROM users WHERE id = ? LIMIT 1', [
    userId,
  ])) as Array<{ token_version: number }>;
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`用户 ${userId} 不存在`);
  }
  return row.token_version;
}

/**
 * 统计某账号未撤销的 refresh token 数量。
 *
 * @param dataSource 应用使用的数据源。
 * @param userId 账号 id。
 * @returns 未撤销条数。
 */
export async function countActiveRefreshTokens(
  dataSource: DataSource,
  userId: number,
): Promise<number> {
  const rows = (await dataSource.query(
    'SELECT COUNT(*) AS total FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL',
    [userId],
  )) as Array<{ total: number | string }>;
  const total = rows[0]?.total ?? 0;
  return Number(total);
}
