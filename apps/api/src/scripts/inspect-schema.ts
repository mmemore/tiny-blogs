/**
 * schema 自检脚本：打印五张表的 `SHOW CREATE TABLE`。
 *
 *   pnpm --filter @tiny-blogs/api db:schema
 *
 * 用途：迁移后在终端肉眼核对字段、索引、字符集与 ngram 全文索引，
 * 并与 `docs/design/fields-and-interfaces.md` §2 逐条比对。
 */
import { createAppDataSource } from '../database/data-source';

/** 契约 §2 定义的全部表。 */
const TABLES = ['users', 'refresh_tokens', 'posts', 'tags', 'post_tags'] as const;

/**
 * 脚本入口。
 */
async function main(): Promise<void> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    for (const table of TABLES) {
      const rows = await dataSource.query<Array<Record<string, string>>>(
        `SHOW CREATE TABLE \`${table}\``,
      );
      const row = rows[0];
      const ddl = row === undefined ? '(表不存在)' : Object.values(row)[1] ?? '(空)';
      process.stdout.write(`\n===== ${table} =====\n${ddl}\n`);
    }
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`读取 schema 失败：${message}\n`);
  process.exitCode = 1;
});
