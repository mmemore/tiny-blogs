/**
 * 清库脚本：删掉本项目的全部表（含 TypeORM 迁移记录表）。
 *
 *   pnpm --filter @tiny-blogs/api db:reset
 *
 * 用途：本地演练"从零重建"。删表而不是删库，是因为 compose 创建的数据库账号
 * 只对 `DB_NAME` 有权限，没有全局 CREATE/DROP DATABASE 权限。
 * 之后重跑迁移 + 种子即可得到与首次部署完全一致的 schema。
 */
import { createAppDataSource } from '../database/data-source';

/** 需要清理的表，按外键依赖的逆序排列（同时关闭外键检查，顺序仅作可读性冗余）。 */
const TABLES = ['post_tags', 'posts', 'tags', 'refresh_tokens', 'users', 'migrations'] as const;

/**
 * 脚本入口。
 */
async function main(): Promise<void> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES) {
      await dataSource.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
    process.stdout.write(`已清空数据表：${TABLES.join(', ')}\n`);
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`清库失败：${message}\n`);
  process.exitCode = 1;
});
