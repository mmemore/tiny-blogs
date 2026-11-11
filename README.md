# tiny-blogs

一个自带写作后台的个人博客：**Vue 3 预渲染前台 + NestJS API + MySQL 8**。
前台是静态 HTML（爬虫拿到的是带正文的页面），后台是同源 SPA；内容存数据库，
发布时用一条命令把数据库内容全量重建成静态站。

- 前台：`/`、`/posts`、`/posts/:slug`、`/tags`、`/tags/:slug`、`/archives`、`/about`
- 后台：`/admin`（登录、文章列表、Markdown 编辑器 + 图片上传、标签管理）

设计取舍写在 ADR 里，先读这两篇就能理解整体形状：
[ADR-0001 预渲染](docs/adr/0001-vue-spa-with-prerender.md)、
[ADR-0004 内容在 MySQL、发布即全量重建](docs/adr/0004-mysql-content-with-full-rebuild.md)。

---

## 1. 本地启动

### 前置条件

- Node.js ≥ 20，pnpm 10（`package.json` 的 `packageManager` 字段固定了版本）
- Docker（只用它跑 MySQL；API 与前端都在本机进程里跑）

### 步骤

```bash
# 1. 安装依赖（workspace 内三个包一次装好）
pnpm install

# 2. 准备配置：复制模板，把占位符换成真实值
cp .env.example .env
#    - JWT_SECRET / BUILD_EXPORT_TOKEN：用模板里给的 crypto 命令各生成一个
#    - DB_PASSWORD / DB_ROOT_PASSWORD：与 compose.dev.yml 用的值保持一致
#    - ADMIN_PASSWORD：首次启动时用来创建管理员，至少 12 位

# 3. 起 MySQL（等 healthcheck 通过再返回）
pnpm db:up

# 4. 建表
pnpm migration:run

# 5. 种子数据：先建管理员，再灌 9 篇示例文章
pnpm seed
pnpm seed:demo

# 6. 同时起 shared 监听、API、前端
pnpm dev
```

打开 <http://127.0.0.1:5173> 是前台，<http://127.0.0.1:5173/admin> 是后台
（账号密码就是 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`）。
API 单独监听 `http://127.0.0.1:3000/api`，前端 dev server 把 `/api` 与 `/uploads`
代理过去，所以浏览器里始终是同源请求（见 [ADR-0005](docs/adr/0005-monorepo-and-dev-environment.md)）。

常用辅助命令：`pnpm db:down`、`pnpm db:logs`、`pnpm db:reset`（清库重跑迁移 + 种子）、
`pnpm migration:show`、`pnpm migration:revert`（回滚最近一次迁移）、`pnpm db:schema`。

---

## 2. 测试

```bash
pnpm typecheck   # 三个包一起跑 tsc / vue-tsc
pnpm lint        # 根目录 ESLint（flat config，前后端共用一套规则）
pnpm test        # shared 纯函数单测 + API 的 HTTP 边界（supertest）
```

`pnpm test` 需要 MySQL 在跑（`pnpm db:up`）：API 的集成用例直接打真实数据库，
用的是独立库名、每个 describe 前后自清理，不会碰 `DB_NAME` 里的数据。

发布链路的产物检查是另一个命令（不需要数据库，但需要先跑过一次 `pnpm release`）：

```bash
pnpm smoke
```

它断言：关键页面（含每篇已发布文章）都存在、文章页 HTML 源码里直接有正文、
`<title>` / `og:title` / `og:description` / `article:published_time` 正确、
草稿不产生目录、`/admin` 不参与预渲染、零 `fonts.googleapis.com` 直连、
`BUILD_EXPORT_TOKEN` 的实际值不出现在任何产物里。

浏览器端的端到端脚本在 `qa/`（Playwright 驱动，非 CI 门禁）：`qa/e2e-*.cjs` 主旅程与
409 冲突场景，`qa/security-check.cjs` 做一轮安全断言。

---

## 3. 发布

发布 = **重新生成一份完整的静态站并整体替换**，中间不会出现半成品。

```bash
# API 必须在跑（构建期要从它取快照），然后：
pnpm release
pnpm smoke        # 建议每次都跑：断言项数随快照篇数浮动，失败列出差异清单
```

`pnpm release` 做四件事：

1. 带 `X-Build-Token: $BUILD_EXPORT_TOKEN` 请求 `GET /api/build/export`，
   拿一份 `ContentSnapshot`（`version: 1` + site + posts 含原文 + tags + archive），
   落到 `.release/snapshot.json`（gitignored）。拿不到快照就**直接失败**，不会产出半成品。
2. 用快照里的 slug 清单作为预渲染路由（`/admin` 前缀与带参路由永不参与）。
3. `vite-ssg` 全量预渲染到 `dist-next`：每篇文章一个 `dist/posts/<slug>/index.html`，
   head 在构建期就写死，HTML 里直接带正文。
4. 成功后原子替换：`dist` → `dist-prev` → `dist-next` 改名 `dist`；任何一步失败都保留
   上一版 `dist`，并把失败的产物归档到 `.release/trash/`（不递归删除，便于排查）。

注意区分：`pnpm build` 是普通 SPA 构建（不预渲染、直接写 `apps/web/dist`），
日常交付请走 `pnpm release`，不要用它代替。

部署只需要两件事：

- 把 `apps/web/dist` 当静态目录发布（目录结构即 URL 结构，不需要 rewrite 规则；
  未知路径建议兜底 rewrite 到 `/index.html`，让前端 404 页自己接管）。
- 反向代理把 `/api` 与 `/uploads` 转给 API 进程（同源，见 [ADR-0005](docs/adr/0005-monorepo-and-dev-environment.md)）。

正式发布前把 `.env` 里的 `VITE_SITE_URL` 设成真实域名再跑 `pnpm release`：
`og:url` / `og:image` / 规范链接都由它拼出（不设的话会带上 dev 端口）。
后台登录态是「内存 access token + httpOnly refresh cookie」
（见 [ADR-0003](docs/adr/0003-jwt-dual-token-auth.md)），所以后台必须与 API 同源，
且发布静态产物不会影响后台登录。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3.5（`<script setup>`）、vue-router 4、Pinia、Tailwind CSS 4、naive-ui（仅后台） |
| 预渲染 | vite-ssg（SSR 渲染每个路由后落成静态 HTML）+ unhead 管理 head |
| API | NestJS 10、TypeORM 0.3、class-validator、Multer（图片上传） |
| 数据库 | MySQL 8（InnoDB + `ngram` 分词做中文全文检索） |
| 构建/工具 | pnpm workspace、Vite 6、TypeScript 5.7、ESLint 9（flat config） |
| 测试 | Vitest（shared 与 API 都是）+ supertest（API 的 HTTP 边界）、Playwright（qa/ 手动 E2E） |

## 目录速览

```
apps/api            NestJS API：内容读写、鉴权、上传、构建导出
  src/modules/      content / storage / build / auth 等，按模块边界组织
  src/database/     实体、迁移、种子（migration 只前进不回滚）
apps/web            Vue 3 前端（同一份代码既是 SPA 也是预渲染源）
  src/views/        前台页面；src/views/admin/ 后台页面（懒加载，不进首屏）
  src/composables/  useAsyncData（可预渲染的取数原语）、usePageMeta（head 声明）
packages/shared     前后端共用契约：类型、Markdown 渲染器、slug/分页纯函数（CJS 单产物）
scripts/            release.mjs（发布编排）、smoke.mjs（构建冒烟）
docs/adr            架构决策记录
qa/                 浏览器端 E2E 与安全断言脚本（非 CI 门禁）
```

---

## 已知限制

这些是 v1 有意接受的取舍，不是待修 bug；改动前请先看对应 ADR。

1. **乐观锁只到秒**：`expectedUpdatedAt` 用秒精度时间戳比对，同一秒内的两次保存
   可能都判定为"没有冲突"。冲突检测用于兜住"另一个窗口改了同一篇"，不用于并发写安全。
2. **曲目号上限 104**：文章在封套上按黑胶唱片的 A/B 面 × 曲目号编号（`SIDE` + `TRACK`），
   单面最多 52 首，因此全站上限 104 篇。超出后编号会重复，需要改成双唱片或多卷。
3. **shared 契约块首访要下载一份**：`@tiny-blogs/shared` 按 ADR-0005 只出 CJS 单产物，
   无法按导出 tree-shake（`export *` 把 markdown-it + highlight.js 带进来），
   所以它被切成独立 chunk（约 270 KB / gzip 约 100 KB）。首访会下载，之后长期缓存命中；
   详情页不解析 Markdown，只有关于页才真正执行渲染器。
4. **后台组件库块偏大**：naive-ui 被切成 `admin` chunk（约 500 KB / gzip 约 160 KB），
   只在进入 `/admin` 时加载，前台入口 chunk 里不含它的任何字节。v1 不做按组件拆包。
5. **发布有约 1 分钟的窗口期**：全量重建需要 2 分钟左右（本机实测 116–167 s），
   建好后原子替换。这期间线上仍是上一版内容——这是 [ADR-0004](docs/adr/0004-mysql-content-with-full-rebuild.md)
   明确的代价，换掉它需要引入增量渲染。
