# 05: 读侧公开接口

**What to build:** 访客能读到的一切：列表分页、标签与年份过滤、中文全文搜索、带目录与上下篇的文章详情、标签计数、年月归档。草稿在公开面上结构性不可见；`track`（曲目号/面/目录号/彩胶配色）与阅读时长等派生值由 shared 单一实现产出。可与 03/04 并行：测试数据直插数据库。

**Blocked by:** 02 Schema、迁移与种子管理员（与 03、04 并行）

**Status:** ready-for-agent

- [ ] `GET /api/posts`：分页（默认 8/页）、tag、year 过滤；`q` 走 ngram 全文检索且中文关键词命中
- [ ] 列表项含派生 `track` 与 `readingMinutes`；排序恒为 `published_at DESC, published_seq DESC`
- [ ] `GET /api/posts/:slug`：返回 `html` + `headings` + prev/next；不返回 `contentMd`；草稿与不存在统一 404，不泄漏存在性
- [ ] `GET /api/tags` 返回 count 聚合；`GET /api/archives` 按 年→月 聚合
- [ ] 只返回 published 的不变量在模块内部实现，调用方代码不含 status 条件
- [ ] 投影函数与导出快照共用（与票 10 的数据一致性由此保证）
- [ ] supertest 覆盖以上路径，含"草稿不可见"与中文搜索命中两条关键断言
