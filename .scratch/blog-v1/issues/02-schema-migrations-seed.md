# 02: Schema、迁移与种子管理员

**What to build:** 空数据库上一条迁移命令建出契约定义的全部表并创建管理员账号。完成后任何人可以从零重建出完全一致的 schema——这是 TypeORM 三纪律（禁 synchronize、迁移入库、人工审查）落地的第一站。

**Blocked by:** 01 Monorepo 骨架与开发环境

**Status:** ready-for-agent

- [ ] 迁移在空库上创建 users / refresh_tokens / posts / tags / post_tags，字段与索引和 `docs/design/fields-and-interfaces.md` §2 一致（含 `published_seq` 唯一、`author_id` 外键、`status` 复合索引、`FULLTEXT ... WITH PARSER ngram`）
- [ ] TypeORM `synchronize` 恒为 false；迁移文件全部入库可审计
- [ ] 首次启动按环境变量创建管理员（argon2id 哈希）；口令不写入任何日志
- [ ] 迁移幂等：重复执行不报错；删库重跑后 schema 一致
- [ ] 无 `cover_url`、无 `featured` 字段（契约 §1 的删减生效）
