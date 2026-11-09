# Spec: tiny-blogs v1（个人全栈博客，作品集导向）

Status: ready-for-agent
Spec: .scratch/blog-v1/spec.md

## Problem Statement

作者是一名 3 年经验的前端开发者，正在准备求职。缺少一个能同时证明前端工程能力与全栈交付能力的公开可访问作品：现有简历项目要么是公司内部系统无法对外展示，要么是纯静态页面无法体现后端能力。同时，作者希望拥有一个真正可长期写作、可被搜索引擎收录的个人博客，而不是一次性 demo。

## Solution

一个前后端分离的全栈博客：Vue 3 + Vite 前台（构建期预渲染保证 SEO）+ 网页后台（登录后用 Markdown 编辑器写作、上传图片）+ NestJS API + MySQL 8，本地 Docker 化开发，发布链路为"后台发布 → 导出接口 → 全量预渲染生成静态 HTML"。访客获得快速、可被搜索收录的阅读体验；作者获得完整的后台写作体验；招聘方获得一个可以点开验证全栈能力的线上项目。

## User Stories

1. As a 访客, I want 打开首页就能看到文章列表与精选内容, so that 我能立刻判断这个博客值不值得继续看。
2. As a 访客, I want 文章详情页是预渲染的静态 HTML, so that 我不用等 JS 执行就能读到正文。
3. As a 访客, I want 文章正文排版良好（标题层级、代码块高亮、引用、列表、表格）, so that 阅读技术文章不费眼。
4. As a 访客, I want 在移动端也能舒适阅读, so that 我可以在手机上浏览分享来的文章。
5. As a 访客, I want 通过标签筛选文章, so that 我能只看某个主题的内容。
6. As a 访客, I want 按时间归档浏览全部文章, so that 我能了解博主产出的频率与历史。
7. As a 访客, I want 站内搜索文章关键词（中文）, so that 我能直接定位到我需要的那篇文章。
8. As a 访客, I want 点击标签/文章链接时切换不闪白、加载快, so that 浏览体验流畅。
9. As a 访客, I want 分享链接到微信/推特时有正确的标题、摘要与封面图（OG 标签）, so that 分享卡片不残缺。
10. As a 访客, I want 在文章页看到上一篇/下一篇导航, so that 我可以顺着读下去。
11. As a 访客, I want 知道文章的发布时间与最后更新时间, so that 我能判断内容是否过时。
12. As a 招聘方, I want 直接看到"关于"页里作者的技术背景与项目介绍, so that 我不用额外打听就能评估候选人。
13. As a 招聘方, I want 网站有 HTTPS、自定义域名、正常的加载速度, so that 我把它当作工程水平的直接证据。
14. As a 招聘方, I want 通过 GitHub 仓库链接看到源码的工程化程度（测试、迁移、CI）, so that 我能评估代码质量而不只是看界面。
15. As a 作者, I want 在网页后台用 Markdown 编辑器写文章（实时预览）, so that 我在任何设备上都能写作而不仅限本地。
16. As a 作者, I want 把文章保存为草稿、发布前反复修改, so that 半成品不会被访客看到。
17. As a 作者, I want 发布后可以继续编辑并更新（更新时间自动变化）, so that 我能维护内容的正确性。
18. As a 作者, I want 在编辑器里直接粘贴/上传图片并自动插入正文, so that 我不用手动管理图床。
19. As a 作者, I want 给文章打标签、在后台管理标签, so that 内容组织不需要预设分类体系。
20. As a 作者, I want slug 可自定义, so that URL 干净且对 SEO 友好。
21. As a 作者, I want 用账号密码登录后台且会话长期有效（30 天滑动）, so that 我不用每天重新登录。
22. As a 作者, I want 安全的会话管理（XSS 偷不走凭据、被滥用时能强制下线）, so that 我的后台不成为攻击入口。
23. As a 作者, I want 登录接口有频率限制, so that 撞库脚本无法暴力尝试我的密码。
24. As a 作者, I want 后台编辑器防误触（未保存离开提示、自动草稿）, so that 长文不会因为一次手滑丢失。
25. As a 作者, I want 一个"发布即生效"的机制：发布文章后前台可见, so that 写完不需要理解构建细节。
26. As a 作者, I want 本地一键启动整套开发环境（前端热更新 + API + MySQL）, so that 新机器十分钟内能开工。
27. As a 作者, I want 一条命令产出可部署的静态产物与 API 镜像, so that 部署不需要记忆一串手工步骤。
28. As a 作者, I want 数据库结构变更有版本化迁移, so that 任何环境重建后 schema 一致。
29. As a 作者, I want 文章数据可从后台一键导出（JSON 备份）, so that 数据主权在自己手里。
30. As a 作者, I want 评论能力已预留（Giscus 占位）, so that 仓库转公开后补一行配置即可启用。

## Implementation Decisions

- **总体架构**：pnpm workspace monorepo。`apps/web`（Vue 3 + TS + Vite + Pinia + vite-router）、`apps/api`（NestJS）、`packages/shared`（DTO 类型、常量、校验，被两端共同引用）。
- **渲染策略**：前台为 SPA + `vite-ssg` 构建期全量预渲染；预渲染数据来自 API 的受 token 保护的导出接口。运行时不做 SSR。
- **后端**：NestJS + TypeORM + MySQL 8。TypeORM 使用纪律：`synchronize` 永远 false；迁移人工审查后入库；复杂查询走 QueryBuilder。
- **鉴权**：JWT 双 token。access token 15 分钟、仅存前端内存；refresh token 30 天、httpOnly + SameSite=Strict cookie，路径限定在 `/api/auth`；refresh 轮换 + 重放检测；`users.token_version` 支持全局强制下线。密码 argon2id 哈希。登录接口用 `@nestjs/throttler` 限流。管理员账号由环境变量种子化创建，v1 无注册入口。
- **数据模型**：
  - `users`：id、username、password_hash、token_version
  - `refresh_tokens`：id、user_id、token_hash、expires_at、revoked_at（轮换与重放检测依据）
  - `posts`：id、title、slug（唯一索引）、summary、content_md、cover_url、status（draft/published）、published_at、updated_at；title/summary/content_md 上建 **ngram 全文索引**（中文检索必需）
  - `tags`：id、name（唯一）、slug
  - `post_tags`：post_id + tag_id 联合主键
- **API 契约**（v1）：
  - 公开：`GET /api/health`、`GET /api/posts`（分页 + tag/q 过滤）、`GET /api/posts/:slug`、`GET /api/tags`、`GET /api/archives`（按年月聚合）
  - 鉴权：`POST /api/auth/login`、`POST /api/auth/refresh`、`POST /api/auth/logout`、`GET /api/auth/me`
  - 管理（JWT Guard）：`GET/POST/PUT/DELETE /api/admin/posts`（含草稿）、`GET/POST/PUT/DELETE /api/admin/tags`、`POST /api/admin/upload`、`GET /api/admin/export`（JSON 全量导出，供备份与构建共用）
  - 构建：`GET /api/build/export?token=...`（服务间 token，供 vite-ssg 构建期拉取全部已发布数据）
- **Markdown 渲染位置**：API 只存 Markdown；HTML 渲发生在前端（预渲染期与客户端同一套 markdown-it/unified 管线，含代码高亮），保证构建产物与运行时一致。
- **图片存储**：`StorageService` 抽象（save/delete/getUrl），v1 实现为本地卷（挂载目录由 API 静态服务）；上传走 multipart，按内容 hash 命名防重复，限制类型与大小。
- **前台路由**：`/`、`/posts`、`/posts/:slug`、`/tags/:slug`、`/archives`、`/about`；`/admin/*`（login、文章列表、编辑器、标签管理）不参与预渲染，独立 chunk。
- **UI**：前台 Tailwind CSS v4 自研；后台 Naive UI，仅 admin chunk 按需引入。
- **发布链路**：`pnpm release` = 调构建导出接口 → vite-ssg 全量预渲染 → 产出 `apps/web/dist`。CI 化与服务器重建推迟到部署阶段。
- **本地环境**：`compose.dev.yml` 仅启动 MySQL 8 + Adminer；web/api 在宿主机直接跑（保留 HMR）。依赖 Node ≥ 20、pnpm。
- **评论**：Giscus 组件做占位（配置项空则不渲染），仓库转 public 后填入 repo id 即启用。
- **配置管理**：`.env.example` 列全量变量；`.env` 入 .gitignore。

## Testing Decisions

- 好的测试只验证外部行为（HTTP 状态码、响应结构、副作用），不断言内部实现。
- **唯一的重缝：API 的 HTTP 边界**。用 supertest 起完整 Nest 应用打真实接口，数据库用 compose.dev.yml 的 MySQL（独立 schema，测试前清空）。覆盖：
  - 鉴权全流程：登录成功/失败、access 过期后 refresh、refresh 轮换、旧 refresh 重放触发全部会话撤销、token_version 提升后旧 token 拒绝、限流生效
  - 文章 CRUD：草稿对公开接口不可见、slug 唯一冲突、发布/更新时间语义
  - 导出接口：token 正确返回全量、token 错误 401
  - 中文全文搜索：ngram 命中（断言中文关键词能搜到）
- **前端轻缝：构建冒烟**。`pnpm build` 成功 + 关键页面 dist HTML 存在 + 文章页 `<title>`/OG meta 正确。不做运行时组件测试（v1 范围外）。
- 仓库暂无既有测试先例，本 spec 建立的就是先例。

## Out of Scope

- 分类体系（与标签二选一，v1 只有标签）
- 评论功能的实际接入（仅 Giscus 占位，仓库转 public 后启用）
- 项目展示页、友链页（v2）
- 浏览量统计（v2）
- 多用户注册（鉴权为单管理员种子）
- CI/CD 流水线、服务器部署、域名与 HTTPS、生产 compose 编排
- RSS/订阅、邮件通知、暗色模式切换（暗色可由 Tailwind 预留样式变量，v1 只做亮色）
- 国际化（v1 仅中文界面）

## Further Notes

- 中文全文检索依赖 MySQL ngram parser，建索引时必须显式 `WITH PARSER ngram`，否则中文搜索无效——这是容易被面试官问到的细节。
- "发布后可见"存在约 1 分钟延迟（全量重建），对个人博客可接受；spec 不承诺实时。
- 域术语以 `GLOSSARY.md` 为准（Post/发布/导出/全量重建等），后续 issue 与代码命名不得漂移。
- 架构决策背景见 `docs/adr/0001`–`0005`。
