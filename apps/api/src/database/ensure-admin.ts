import type { DataSource } from 'typeorm';
import { hashPassword } from '../common/password';

/** 种子结果：新建 / 已存在（幂等）。 */
export type AdminSeedResult = 'created' | 'existing';

/** 种子管理员凭据。 */
export interface AdminCredentials {
  readonly username: string;
  readonly password: string;
}

/**
 * 确保管理员账号存在（幂等）。
 *
 * - 已存在同名用户 → 直接返回 `'existing'`，**不覆盖**已有口令。
 * - 不存在 → 用 argon2id 哈希后插入。
 * - 口令只在此函数内以明文形式存在，不写日志、不进返回值。
 *
 * @param dataSource 已初始化的数据源。
 * @param credentials 来自 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。
 * @returns `'created'` 表示本次新建，`'existing'` 表示跳过。
 */
export async function ensureAdminUser(
  dataSource: DataSource,
  credentials: AdminCredentials,
): Promise<AdminSeedResult> {
  const existing = await dataSource.query<Array<{ id: number }>>(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [credentials.username],
  );
  if (existing.length > 0) {
    return 'existing';
  }

  const passwordHash = await hashPassword(credentials.password);

  try {
    await dataSource.query(
      'INSERT INTO users (username, password_hash, token_version) VALUES (?, ?, 0)',
      [credentials.username, passwordHash],
    );
  } catch (error) {
    // 多进程同时启动时可能撞 username 唯一索引：视为已存在，不算启动失败。
    if (isDuplicateEntryError(error)) {
      return 'existing';
    }
    throw error;
  }

  return 'created';
}

/**
 * 判断是否为 MySQL 唯一键冲突（`ER_DUP_ENTRY`）。
 *
 * @param error 捕获到的异常。
 * @returns 命中重复键返回 true。
 */
function isDuplicateEntryError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  );
}
