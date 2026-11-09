# GLOSSARY

本仓库的领域术语表。issue、代码、文档中的命名不得漂移到同义词。

| 术语 | 英文/代码名 | 含义 |
|---|---|---|
| 文章 | Post | 博客的核心内容单元，含 Markdown 正文与元数据。代码与 API 一律用 `post`，不用 article/entry/blog。 |
| 草稿 | Draft | `status=draft` 的文章，对一切公开接口不可见。 |
| 发布 | Publish | 草稿转为 `status=published` 并获得 `published_at` 的动作。再次保存不改变首次发布时间。 |
| 标签 | Tag | 文章的多对多组织维度；v1 不引入分类（Category）。 |
| 归档 | Archive | 按年月聚合的已发布文章时间视图。 |
| 后台 | Admin | 仅作者可用的管理界面（`/admin`），登录态由鉴权模块保护。 |
| 导出 | Export | API 输出的全量已发布内容 JSON。备份与构建共用同一接口。 |
| 全量重建 | Full rebuild | 重新执行预渲染、重生成全部静态 HTML 的构建动作。 |
| 发布构建 | Release build | `pnpm release` 触发的链路：拉导出数据 → vite-ssg 预渲染 → 产出 `dist`。 |
| 预渲染 | Prerender | 构建期把路由渲染成静态 HTML（vite-ssg），区别于运行时 SSR。 |
| 存储服务 | StorageService | 图片读写的抽象接口（save/delete/getUrl）；v1 实现为本地卷。 |
| 访客 | Visitor | 未登录的任何前台读者，含招聘方。 |
| 构建导出令牌 | Build export token | 保护 `/api/build/export` 的服务间 token，与用户鉴权体系无关。 |
