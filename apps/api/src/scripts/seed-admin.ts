/**
 * 种子脚本：确保 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 对应的管理员存在（幂等）。
 *
 *   pnpm --filter @tiny-blogs/api seed
 *
 * 已经存在同名账号时不会覆盖口令；改密走后续的 CLI 重置流程。
 */
import { readApiEnv } from '../config/env';
import { createAppDataSource } from '../database/data-source';
import { ensureAdminUser } from '../database/ensure-admin';

/**
 * 脚本入口。
 */
async function main(): Promise<void> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    const env = readApiEnv();
    const result = await ensureAdminUser(dataSource, {
      username: env.admin.username,
      password: env.admin.password,
    });
    const message =
      result === 'created'
        ? `管理员已创建：${env.admin.username}`
        : `管理员已存在，跳过：${env.admin.username}`;
    process.stdout.write(`${message}\n`);
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`种子执行失败：${message}\n`);
  process.exitCode = 1;
});
