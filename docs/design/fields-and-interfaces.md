# 字段与接口契约（v1）

依据：`.scratch/blog-v1/spec.md`（PRD）、`.scratch/blog-v1/prototype/index.html`（12 屏原型）、`design/v6/index.html`（视觉方向 06 · 彩胶俱乐部）。

本文是数据与接口的**唯一契约**。spec 负责"做什么"，本文负责"长什么样、怎么调"。术语以 `GLOSSARY.md` 为准；设计稿里的"曲目/彩胶/年鉴/员工通道"是展示文案，代码与字段一律用 `post` / `accent` / `archive` / `admin`。

## 1. 从设计稿倒推出的三个隐含需求

| 设计稿证据 | 隐含需求 | 结论 |
|---|---|---|
| 封面是"SIDE A · A1 · 橘胶"的唱片，`CAT. TB—001` | 封面不是图片，是**生成的视觉**；但编号必须稳定（唱片编号不因新碟发行而位移） | 删除 `posts.cover_url`；新增 `posts.published_seq`（发布时分配、永久不变） |
| 曲目表 `A1 / A2 / A3 / A4 / B1 / B2` + "四色一圈轮下去" | 曲目号、面、颜色都由序号派生，且规则必须唯一 | 不落库，集中在 shared 的一个纯函数里派生 |
| 首页 hero 标 `NEW PRESSING`（最新），不再有原型的"精选"分区 | `featured` 字段失去用途 | v1 不加 `featured`；hero = 最新一篇（`published_seq` 最大） |

正面后果：编辑器少一个控件、查询少一条分支、数据库少一个需要人维护的布尔值。

## 2. 字段

### users

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto | |
| `username` | varchar(32) | unique, not null | 登录名，v1 仅种子账号 |
| `password_hash` | varchar(255) | not null | argon2id |
| `token_version` | int unsigned | not null default 0 | 自增即令该用户所有旧 access/refresh 失效 |
| `created_at` / `updated_at` | datetime | not null | |

无 `email`：v1 不做找回密码，重置用 CLI 脚本改 `password_hash` 并 `token_version++`。将来加多作者时再补 `email` 与 `role`。

### refresh_tokens

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | bigint unsigned | PK | |
| `user_id` | bigint unsigned | FK → users.id, index | |
| `token_hash` | char(64) | unique, not null | sha256(refresh 原文)，不存明文 |
| `expires_at` | datetime | not null | 签发 + 30d |
| `revoked_at` | datetime | null | 轮换或重放检测时写入 |
| `created_at` | datetime | not null | |

重放检测：收到一个 `revoked_at` 非空的 token，视为泄漏 → 撤销该 `user_id` 全部未撤销 token（`revoked_at = now()`）并 `token_version++`。

### posts

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | bigint unsigned | PK | |
| `author_id` | bigint unsigned | FK → users.id, index | 归属校验依据 |
| `title` | varchar(120) | not null | |
| `slug` | varchar(140) | unique, not null | `^[a-z0-9]+(-[a-z0-9]+)*$`，决定 URL 与 SEO |
| `summary` | varchar(200) | not null | 列表卡片 + `<meta name="description">` + OG description；建议 40–120 字 |
| `content_md` | mediumtext | not null | Markdown 原文；HTML 不入库 |
| `status` | enum('draft','published') | not null default 'draft', index | |
| `published_seq` | int unsigned | unique, null | 首次发布时分配（`max(seq)+1`），取消发布保留原值 |
| `published_at` | datetime | null, index | 首次发布时间，后续保存不改 |
| `created_at` / `updated_at` | datetime | not null | `updated_at` 兼作乐观锁版本 |

索引：`FULLTEXT(title, summary, content_md) WITH PARSER ngram`（中文检索必需），`INDEX(status, published_at)`，`INDEX(status, published_seq)`。

**已删除**：`cover_url`（理由见 §1）。正文内插图仍然走上传，URL 写在 Markdown 里。

### tags / post_tags

| 表 | 字段 | 约束 |
|---|---|---|
| `tags` | `id` bigint PK、`name` varchar(24) unique、`slug` varchar(32) unique not null、`created_at` | 后台手填 slug（标签量小，拼音生成不值得引依赖） |
| `post_tags` | `post_id` + `tag_id` 联合 PK；`INDEX(tag_id)` | 文章数由 `COUNT(post_tags)` 聚合，不冗余存储 |

## 3. 派生字段（不落库，规则只写一次）

| 派生值 | 规则 | 用在哪 |
|---|---|---|
| `readingMinutes` | 中文按 400 字/分钟、代码块按 20 行/分钟累加，`Math.max(1, ceil(...))` | 首页曲目表 `9′`、列表页、详情页、导出 |
| `track.no` | `side = A + floor((seq-1)/4)`；`no = side + ((seq-1) % 4 + 1)` → A1…A4、B1…B4 | 曲目表、sleeve |
| `track.catalog` | `TB—` + 三位补零 `seq` | sleeve |
| `track.accent` | `['v1','v2','v3','v4'][(seq-1) % 4]`（橘/蓝/绿/莓红，四色一圈轮下去） | 曲目号颜色、sleeve 胶体 |
| `headings` | 从 `content_md` 提取 h2/h3，带序号与锚点 | 详情页目录（原型详情变体 2） |
| `archive` | 按 `published_at` 的 year → month 分组，组内按 seq 降序 | 归档"年鉴"页 |

这些派生值**必须**由 `packages/shared` 的同一份实现产出，否则预渲染产物与客户端交互会出现两套编号（这正是原型评论里 `markdown-pipeline` 一文讲的坑）。

## 4. 模块与接口

按深模块原则组织：小接口、大实现，不变量藏在模块里而不是调用方脑子里。

### 4.1 `shared/content`（纯函数，无 I/O）

```ts
// 记录形态：数据库行（详情页用）
export type PostRecord = {
  id: number; authorId: number; title: string; slug: string; summary: string;
  contentMd: string; status: 'draft' | 'published';
  publishedSeq: number | null; publishedAt: string | null; updatedAt: string;
}

export function renderMarkdown(md: string): { html: string; headings: Heading[]; readingMinutes: number }
export function toTrack(seq: number): { no: string; side: string; catalog: string; accent: Accent }
export function toPostSummary(p: PostRecord): PostSummary      // 不含 contentMd / html
export function toPostDetail(p: PostRecord, prev?: PostRef, next?: PostRef): PostDetail
```

深度来源：`renderMarkdown` 一次调用同时产出 HTML、目录、阅读时长——调用方（预渲染、编辑器预览、详情页）不需要各自实现三遍，也不会出现三份不一致的规则。`toTrack` 把编号/分面/配色三条规则收进一个函数，改配色只改这里。

### 4.2 `api/content` — 读侧（公开）

```ts
interface ContentQuery {
  listPublished(q: ListQuery): Promise<Page<PostSummary>>
  findPublished(slug: string): Promise<PostDetail | null>   // 含 prev/next
  listTags(): Promise<TagWithCount[]>
  getArchive(): Promise<ArchiveYear[]>
  exportSnapshot(): Promise<ContentSnapshot>                // 构建与备份共用
}
```

不变量（**在模块内部保证，调用方不得自行拼接 status 条件**）：
- 一切方法只返回 `status='published'`；草稿在公开面**结构上不可达**，而不是靠每个查询记得加 where。
- `findPublished` 对草稿与不存在的 slug 一律返回 `null` → HTTP 层统一 404，不泄漏"这篇存在但是草稿"。
- 排序恒定：`published_at DESC, published_seq DESC`。分页必须稳定，否则预渲染与运行时顺序不一致。

`exportSnapshot()` 与公开查询共用同一投影函数，保证"构建时看到的数据"与"线上接口返回的数据"字段完全一致。

### 4.3 `api/authoring` — 写侧（仅 admin）

```ts
interface Authoring {
  create(input: PostInput, actor: Principal): Promise<PostRecord>
  update(slug: string, input: PostInput, expectedUpdatedAt: string, actor: Principal): Promise<PostRecord>
  publish(slug: string, actor: Principal): Promise<PostRecord>
  unpublish(slug: string, actor: Principal): Promise<PostRecord>
  remove(slug: string, actor: Principal): Promise<void>
}
```

不变量：
- `create` 写入 `author_id = actor.id`；`update/publish/unpublish/remove` 先校验归属，非作者 → 403（v1 单管理员也要实现，见 spec 测试决策）。
- `publish` 幂等：已有 `published_seq` 则原样保留（取消发布再发布不换编号）；仅在首次发布时分配 `max(seq)+1` 并写 `published_at`。
- `update` 用 `expectedUpdatedAt` 做乐观锁，不匹配 → 409，避免双开标签页互相覆盖（原型编辑器提示"3 分钟前有自动草稿"，同一机制）。
- 保存草稿=调用 `update`，不额外设 `draft_saved_at`：`updated_at` 就是自动草稿时间。

### 4.4 `api/auth`

```ts
interface Auth {
  login(username: string, password: string): Promise<{ accessToken: string; refreshToken: string }>
  refresh(rawRefresh: string): Promise<{ accessToken: string; refreshToken: string }>  // 轮换
  logout(rawRefresh: string): Promise<void>
  verify(accessToken: string): Promise<Principal>
}
```

错误：凭证错误 → 401 `INVALID_CREDENTIALS`；refresh 失效/过期 → 401 `REFRESH_INVALID`；检测到重放 → 401 `REFRESH_REPLAYED`（并撤销全部会话）。access 内 `sub/userId/ver`，`ver !== users.token_version` 一律 401。

### 4.5 `api/storage`

```ts
interface Storage {
  put(file: { stream: Readable; mime: string; size: number }): Promise<{ key: string; url: string }>
  remove(key: string): Promise<void>
}
```

适配器：`LocalDiskStorage`（v1，落挂载卷，按内容 sha256 命名去重，限制 mime 白名单与 ≤5MB）＋ `InMemoryStorage`（测试用）。**两个适配器**才让这个缝成立；只有一个实现时它只是假设。

## 5. HTTP 契约

统一约定：JSON、`camelCase`、时间为 ISO 8601 带时区。错误体固定 `{ "error": { "code": "...", "message": "..." } }`。分页信封 `{ items, page, pageSize, total }`。

### 公开

| 方法 | 路径 | 参数 | 返回 |
|---|---|---|---|
| GET | `/api/health` | — | `{ status, uptime }` |
| GET | `/api/posts` | `page`(默认1) `pageSize`(默认8,≤24) `tag`(slug) `q` `year` `month` | `Page<PostSummary>` |
| GET | `/api/posts/:slug` | — | `PostDetail` / 404 |
| GET | `/api/tags` | — | `TagWithCount[]` |
| GET | `/api/archives` | — | `ArchiveYear[]` |

`PostSummary`：
```json
{
  "slug": "vite-ssg-prerender",
  "title": "用 vite-ssg 给 Vue 3 博客做预渲染：SEO 与首屏的取舍",
  "summary": "运行时 SSR 要养一台常驻 Node，纯 SPA 又过不了搜索引擎这一关。",
  "publishedAt": "2026-11-02T10:00:00+08:00",
  "updatedAt": "2026-11-05T21:30:00+08:00",
  "readingMinutes": 9,
  "track": { "no": "A1", "side": "A", "catalog": "TB—001", "accent": "v1" },
  "tags": [{ "name": "Vue", "slug": "vue" }]
}
```

`PostDetail` = 上面全部字段 + `{ "html": "<p>…</p>", "headings": [{ "level": 2, "text": "为什么要预渲染", "id": "t1" }], "prev": { "slug": "...", "title": "...", "track": {...} } | null, "next": ... }`。**不返回 `contentMd`**——详情页只需要 HTML 与目录；Markdown 原文只在 admin 与导出里出现，减少一次无谓的正文传输。

`TagWithCount`：`{ name, slug, count }`。`ArchiveYear`：`{ year: 2026, count: 8, months: [{ month: 11, posts: PostRef[] }] }`。

### 鉴权

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | body `{username,password}`；Set-Cookie `refresh_token`（httpOnly, SameSite=Strict, Path=/api/auth, 30d）；返回 `{accessToken}`；限流 5 次/分钟/IP |
| POST | `/api/auth/refresh` | 读 cookie，轮换并 Set-Cookie 新值；返回 `{accessToken}` |
| POST | `/api/auth/logout` | 撤销当前 refresh 并清 cookie |
| GET | `/api/auth/me` | 校验 access，返回 `{ id, username }` |

access token 由前端存内存，通过 `Authorization: Bearer` 发送；不写 cookie、不写 localStorage。

### 管理（均需 Bearer + 归属校验）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/posts` | `?status=draft\|published&q=&page=`；返回含草稿的行（含 `publishedSeq`） |
| POST | `/api/admin/posts` | 新建草稿 |
| GET | `/api/admin/posts/:slug` | 编辑用，返回 `contentMd` |
| PUT | `/api/admin/posts/:slug` | body 含 `expectedUpdatedAt`；409 = 冲突 |
| POST | `/api/admin/posts/:slug/publish` | 分配 seq（幂等） |
| POST | `/api/admin/posts/:slug/unpublish` | 保留 seq |
| DELETE | `/api/admin/posts/:slug` | 硬删（个人博客无需软删；数据可从导出恢复） |
| GET / POST / PUT / DELETE | `/api/admin/tags` | 标签 CRUD；重名 409 |
| POST | `/api/admin/upload` | multipart `file`；返回 `{ key, url }`；`url` 形如 `/uploads/2026/11/<sha8>.png` |
| GET | `/api/admin/export` | 下载 `ContentSnapshot` JSON |

### 构建

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/build/export` | 需 `X-Build-Token`；返回 `ContentSnapshot`；`Cache-Control: no-store` |

```ts
type ContentSnapshot = {
  version: 1;
  generatedAt: string;
  site: { title: string; description: string; author: string; ogImage: string };
  posts: (PostDetail & { contentMd: string })[];   // 构建需要原文（渲染与搜索索引）
  tags: TagWithCount[];
  archive: ArchiveYear[];
}
```

构建期一次拉全量，`vite-ssg` 只为快照里的 slug 生成路由（`includedRoutes` 排除 `/admin`）。

## 6. 与 spec 的差异（已回写）

1. `posts.cover_url` 删除 —— 设计稿的封面是生成的彩胶，不是上传图；OG 图 v1 用站点默认图，per-post 生成图留 v2。
2. `posts.published_seq` 新增 —— 稳定曲目号/编号的唯一来源。
3. `posts.featured` 明确**不加** —— hero 恒为最新一篇。
4. `tags.slug` 明确为**必填手填**（不做拼音生成）。
5. 详情接口不返回 `contentMd`，只返回 `html` + `headings`。

## 7. 待定（不阻塞开工）

| 项 | 影响 | 建议 |
|---|---|---|
| per-post OG 图生成 | 分享卡片只有默认图 | v2 用 satori 在构建期生成 1200×630 |
| 列表页"年份筛选"UI | 设计稿 tools 区只有一个搜索框 | 先只做搜索，年份筛选留到需要时 |
| 浏览量 | 需要写路径与防刷 | v2，用 `POST /api/posts/:slug/view` + 日粒度去重 |
| `ContentSnapshot` 缓存失效 | 构建重复拉全量 | 快照量小（<1MB），先不做 ETag |
