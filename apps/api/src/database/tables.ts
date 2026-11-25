/**
 * 数据表清单。
 *
 * 测试清库与 `db:reset` 都按同一份清单操作；只写一次，避免新增表时漏改某处。
 * 顺序是外键依赖的逆序（清理时同时关闭外键检查，顺序仅作可读性冗余）。
 */

/** 业务表。 */
export const APP_TABLES = ['post_tags', 'posts', 'tags', 'refresh_tokens', 'users'] as const;

/** TypeORM 的迁移记录表（`migrationsTableName`）。 */
export const MIGRATIONS_TABLE = 'migrations';

/** 全部表：业务表 + 迁移记录表。 */
export const ALL_TABLES = [...APP_TABLES, MIGRATIONS_TABLE] as const;
