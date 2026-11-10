import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 建库第一步：`users` / `refresh_tokens` / `posts` / `tags` / `post_tags`。
 *
 * 与 `docs/design/fields-and-interfaces.md` §2 严格一一对应。手工审查要点：
 * - `posts.published_seq` 为 `int unsigned` + **唯一**且可空（首次发布才分配）；
 * - `posts.author_id` 外键 → `users.id`，并单独建索引（归属校验按 author 过滤）；
 * - `posts.status` 为 `enum('draft','published')` 默认 `draft`，配
 *   `(status, published_at)` 与 `(status, published_seq)` 两个复合索引覆盖读侧排序；
 * - `FULLTEXT(title, summary, content_md) WITH PARSER ngram` —— **必须显式指定 ngram parser**，
 *   否则中文按空格切词，搜索直接失效（spec「Further Notes」里点名的坑）；
 * - 没有 `cover_url`、没有 `featured`（契约 §1 的删减）；
 * - `refresh_tokens.token_hash` 为 `char(64)`（sha256 十六进制），唯一且不存明文。
 *
 * 时间戳语义：所有 `datetime` 存 UTC（数据库容器 `--default-time-zone=+00:00`，
 * 驱动 `timezone: 'Z'`），对外由 API 格式化为带时区的 ISO 8601。
 * `updated_at` 不设 `ON UPDATE CURRENT_TIMESTAMP`：它兼作乐观锁版本，必须由应用写入。
 *
 * 幂等性：全部使用 `CREATE TABLE IF NOT EXISTS`，且索引在表内声明（MySQL 没有
 * `CREATE INDEX IF NOT EXISTS`），因此即便迁移记录表被清空，重复执行也不会报错。
 */
export class CreateBlogSchema1762760000000 implements MigrationInterface {
  name = 'CreateBlogSchema1762760000000';

  private static readonly TABLE_OPTIONS =
    'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci';

  /**
   * @param queryRunner TypeORM 查询运行器。
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        username varchar(32) NOT NULL,
        password_hash varchar(255) NOT NULL,
        token_version int unsigned NOT NULL DEFAULT 0,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_users_username (username)
      ) ${CreateBlogSchema1762760000000.TABLE_OPTIONS}
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        user_id bigint unsigned NOT NULL,
        token_hash char(64) NOT NULL,
        expires_at datetime NOT NULL,
        revoked_at datetime NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_refresh_tokens_token_hash (token_hash),
        KEY idx_refresh_tokens_user_id (user_id),
        CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ${CreateBlogSchema1762760000000.TABLE_OPTIONS}
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        author_id bigint unsigned NOT NULL,
        title varchar(120) NOT NULL,
        slug varchar(140) NOT NULL,
        summary varchar(200) NOT NULL,
        content_md mediumtext NOT NULL,
        status enum('draft','published') NOT NULL DEFAULT 'draft',
        published_seq int unsigned NULL,
        published_at datetime NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_posts_slug (slug),
        UNIQUE KEY uk_posts_published_seq (published_seq),
        KEY idx_posts_author_id (author_id),
        KEY idx_posts_status_published_at (status, published_at),
        KEY idx_posts_status_published_seq (status, published_seq),
        FULLTEXT KEY ft_posts_search (title, summary, content_md) WITH PARSER ngram,
        CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE RESTRICT
      ) ${CreateBlogSchema1762760000000.TABLE_OPTIONS}
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        name varchar(24) NOT NULL,
        slug varchar(32) NOT NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_tags_name (name),
        UNIQUE KEY uk_tags_slug (slug)
      ) ${CreateBlogSchema1762760000000.TABLE_OPTIONS}
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS post_tags (
        post_id bigint unsigned NOT NULL,
        tag_id bigint unsigned NOT NULL,
        PRIMARY KEY (post_id, tag_id),
        KEY idx_post_tags_tag_id (tag_id),
        CONSTRAINT fk_post_tags_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
        CONSTRAINT fk_post_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
      ) ${CreateBlogSchema1762760000000.TABLE_OPTIONS}
    `);
  }

  /**
   * @param queryRunner TypeORM 查询运行器。
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS post_tags');
    await queryRunner.query('DROP TABLE IF EXISTS tags');
    await queryRunner.query('DROP TABLE IF EXISTS posts');
    await queryRunner.query('DROP TABLE IF EXISTS refresh_tokens');
    await queryRunner.query('DROP TABLE IF EXISTS users');
  }
}
