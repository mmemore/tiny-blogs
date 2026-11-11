/**
 * 开发用演示数据（幂等）。
 *
 *   pnpm seed:demo
 *
 * 做什么：
 * - 确保管理员存在（复用 `ensureAdminUser`，口令来自 `ADMIN_USERNAME` / `ADMIN_PASSWORD`）；
 * - 按 slug 建/更新 8 篇已发布 + 1 篇草稿，中文标题、摘要、正文，正文覆盖
 *   多级标题、代码块、引用、表格、有序/无序列表；
 * - 6 个标签，每篇 1–3 个。
 *
 * 幂等性（可重复执行、结果稳定）：
 * - 标签按 `slug`（或同名）命中即复用，不新增重复行；
 * - 文章按 `slug` 命中即**更新内容**，但**不动** `published_seq` / `published_at`：
 *   这两个值一经分配就不再变（契约 §3），重复 seed 不能让曲目号跳号；
 * - `updated_at` 恒等于 `published_at`（草稿取固定时间），因此重复执行不会制造
 *   "刚刚更新过"的假象，也不会让乐观锁版本无端前进；
 * - 已有文章若被人为取消发布（`published_seq` 为空），本次会补齐序号，回到可预期的状态。
 *
 * 内容纪律：全部为中性的技术写作，不含真实姓名、公司、联系方式与个人信息；
 * 日期与设计稿同一批（2026-09 至 2026-11），便于截图对照。
 */
import type { DataSource } from 'typeorm';
import { readApiEnv } from '../config/env';
import { createAppDataSource } from '../database/data-source';
import { ensureAdminUser } from '../database/ensure-admin';

/** 代码围栏：正文里到处都是行内代码（反引号），用常量拼比在模板字符串里逐处转义可靠。 */
const FENCE = '```';

/**
 * 把若干行拼成 Markdown 正文。
 *
 * 用行数组而不是模板字符串：正文里充满了行内代码与围栏，模板字符串里每个反引号都要转义，
 * 既易错又难读。行数组让 Markdown 原样可读。
 *
 * @param lines 正文各行（空串表示空行）。
 * @returns 以换行连接的 Markdown。
 */
function md(...lines: string[]): string {
  return lines.join('\n');
}

/** 演示标签。 */
interface DemoTag {
  readonly name: string;
  readonly slug: string;
}

/** 演示文章。 */
interface DemoPost {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  /** 发布时间（ISO）；`null` 表示草稿。 */
  readonly publishedAt: string | null;
  readonly tagSlugs: readonly string[];
  readonly contentMd: string;
}

/** 草稿的固定时间戳：让重复执行得到完全相同的 `created_at` / `updated_at`。 */
const DRAFT_TIME = new Date('2026-11-05T01:00:00.000Z');

/** 六个标签（与设计稿 05 屏的隔板一致）。 */
const DEMO_TAGS: readonly DemoTag[] = [
  { name: 'Vue', slug: 'vue' },
  { name: '构建', slug: 'build' },
  { name: '工程化', slug: 'engineering' },
  { name: '后端', slug: 'backend' },
  { name: 'MySQL', slug: 'mysql' },
  { name: '鉴权', slug: 'auth' },
];

/** 八篇已发布 + 一篇草稿。数组顺序即发布顺序（曲目号 A1…B4 由序号派生）。 */
const DEMO_POSTS: readonly DemoPost[] = [
  {
    slug: 'vite-ssg-prerender',
    title: '用 vite-ssg 给 Vue 3 博客做预渲染：SEO 与首屏的取舍',
    summary: '纯 SPA 上线两周，搜索引擎收录 0 条。比较运行时 SSR 与构建期预渲染之后，选后者，并把导出接口同时当成备份入口。',
    publishedAt: '2026-11-02T02:30:00.000Z',
    tagSlugs: ['build', 'vue'],
    contentMd: md(
      '这个博客的第一版是纯单页应用。上线两周，搜索引擎收录 0 条。原因很朴素：爬虫拿到的 HTML 里只有一个空的 `div#app`。',
      '',
      '可选方案有三个：运行时 SSR、构建期预渲染，以及干脆放弃 SEO。第三种最先被排除——写这些东西就是为了被搜到。',
      '',
      '## 为什么要预渲染',
      '',
      '运行时 SSR 需要一台常驻的 Node 进程，还要处理缓存、降级，以及渲染服务挂了怎么办。对一个更新频率远低于访问频率的博客来说，这些复杂度换不来任何东西。',
      '',
      '> 当内容的更新频率远低于访问频率时，预渲染把渲染这件事从请求路径上彻底挪走了。',
      '',
      '代价只有一个：发布之后要重建一次，中间有一分钟左右的窗口期。',
      '',
      '## 把导出接口当成数据源',
      '',
      '构建期不能连数据库：构建机可能在任何地方，也不该持有生产库凭据。所以 API 单独开了一个导出接口，用独立于用户鉴权的服务间 token 保护。',
      '',
      `${FENCE}ts`,
      "const snapshot = await fetch('/api/build/export', {",
      "  headers: { 'X-Build-Token': process.env.BUILD_EXPORT_TOKEN },",
      '});',
      'const data = await snapshot.json();',
      'await renderAll(data); // 预渲染入口：把快照塞进 store，再逐路由生成静态页',
      FENCE,
      '',
      '这个接口同时被两件事复用：构建拉数据、后台一键导出 JSON 做备份。少写一个接口，也少一处不一致。',
      '',
      '### 两个容易翻车的细节',
      '',
      '1. 后台路由不能进预渲染，否则 `/admin` 会被渲染成静态页并公开可访问。',
      '2. 客户端与构建期必须同一套 Markdown 管线，否则迟早出现线上和本地不一样。',
      '',
      '## 代价与收尾',
      '',
      '全量重建的耗时随文章数线性增长，两千篇以内都在十几秒量级，够用。真到了撑不住的那天再换增量渲染，而不是现在就为它付复杂度。',
      '',
      '| 方案 | 首屏 | 运维成本 | 适用场景 |',
      '| --- | --- | --- | --- |',
      '| 纯 SPA | 依赖脚本执行 | 低 | 后台系统 |',
      '| 运行时 SSR | 快 | 高 | 内容实时性要求高 |',
      '| 构建期预渲染 | 最快 | 低 | 更新频率低的博客 |',
    ),
  },
  {
    slug: 'mysql-ngram-fulltext',
    title: 'MySQL ngram 全文索引踩坑：最短可搜长度、布尔语法与字符集',
    summary: '为了几十篇文章上一套搜索引擎不划算。MySQL 8 的 ngram 解析器够用，但有三个坑必须提前知道。',
    publishedAt: '2026-10-27T03:10:00.000Z',
    tagSlugs: ['mysql', 'backend'],
    contentMd: md(
      '全文检索一开始想的是上 Elasticsearch。后来算了算：一个人写博客，为了搜索几十篇文章再维护一个集群，不划算。MySQL 8 自带 ngram 解析器，中文够用。',
      '',
      '## 建索引',
      '',
      `${FENCE}sql`,
      'ALTER TABLE posts',
      '  ADD FULLTEXT KEY ft_posts_search (title, summary, content_md) WITH PARSER ngram;',
      FENCE,
      '',
      '## 三个坑',
      '',
      '### 一、ngram_token_size 决定最短可搜长度',
      '',
      '默认 `ngram_token_size = 2`，也就是至少两个汉字才能命中。预渲染能搜到，单个字搜不到。这是配置，不是 bug。',
      '',
      '### 二、布尔模式下的运算符',
      '',
      '加号、减号、星号、双引号在 `IN BOOLEAN MODE` 里都是运算符。用户输入 `Vue 3` 时若不处理，查询会静默变成另一件事。',
      '',
      '### 三、字符集',
      '',
      '表是 utf8mb4，连接也必须是 utf8mb4。用命令行灌数据时忘了加 `--default-character-set=utf8mb4`，中文会被写坏——存进去是乱码，搜出来自然也是乱码。',
      '',
      '## 怎么查',
      '',
      `${FENCE}sql`,
      "SELECT id FROM posts",
      "WHERE status = 'published'",
      '  AND MATCH(title, summary, content_md) AGAINST (? IN BOOLEAN MODE);',
      FENCE,
      '',
      '查询词由后端拼接，前端只传一个 `q`。转义规则属于检索实现的一部分，不该让两端各记一遍。',
    ),
  },
  {
    slug: 'jwt-dual-token',
    title: 'JWT 双 token 实战：15 分钟与 30 天',
    summary: '短 token 保证安全，长 token 保证不用天天登录。真正的难点不是有效期，而是刷新失败时怎么收场。',
    publishedAt: '2026-10-19T13:40:00.000Z',
    tagSlugs: ['auth', 'backend'],
    contentMd: md(
      '双 token 的取舍其实只有一个问题：刷新用的那个 token 存哪、怎么撤销。',
      '',
      '## 两种 token 的分工',
      '',
      '| token | 有效期 | 存放位置 | 作用 |',
      '| --- | --- | --- | --- |',
      '| access | 15 分钟 | 内存 | 每个请求带上 |',
      '| refresh | 30 天 | httpOnly cookie | 换一对新的 |',
      '',
      'access 放内存而不是 localStorage：XSS 拿不到，刷新页面重新换一次即可。',
      '',
      '## 刷新流程',
      '',
      '- 请求返回 401，且错误码是 token 过期；',
      '- 用 refresh 换一对新 token；',
      '- 重放原请求，**且只重放一次**，避免死循环。',
      '',
      `${FENCE}ts`,
      'async function request(input: string, init?: RequestInit): Promise<Response> {',
      '  const first = await send(input, init);',
      '  if (first.status !== 401) return first;',
      '  const refreshed = await refreshOnce();',
      '  return refreshed ? send(input, init) : first;',
      '}',
      FENCE,
      '',
      '## 撤销：token_version',
      '',
      '登出、改密码要能立刻失效已有的 refresh token。做法是给用户一个自增的 `token_version`，签发时写进 claim，校验时比对；改密码就加一，旧 token 全部作废，不必遍历删除。',
      '',
      '> 能用一个整数解决的问题，不要用一个 token 黑名单表解决。',
    ),
  },
  {
    slug: 'typeorm-migration-rules',
    title: 'TypeORM 迁移的三条纪律',
    summary: '把 migrationsRun 设成 true 会省事，也会在某天早上把生产库改坏。三条纪律，都是踩出来的。',
    publishedAt: '2026-10-08T01:20:00.000Z',
    tagSlugs: ['backend', 'engineering'],
    contentMd: md(
      '`migrationsRun` 设成 `true` 会省事，也会在某天早上把生产库改坏。三条纪律，都是踩出来的。',
      '',
      '## 一、迁移只前进，不回滚',
      '',
      '`down()` 要写，但只在本地用。线上出问题要用「再写一个迁移改回去」，而不是回滚：回滚依赖的历史状态，线上早就不是那样了。',
      '',
      '## 二、迁移里不写业务逻辑',
      '',
      '迁移只做结构变更和必要的数据搬迁。要算派生值，先加列、再用脚本补数据、最后加约束；把三步塞进一个迁移，出问题只能整段重跑。',
      '',
      '## 三、结构与代码要能各自回滚',
      '',
      '顺序是：先上兼容新旧两种结构的迁移，再发代码，最后收紧约束。',
      '',
      `${FENCE}ts`,
      '// 第一步：允许为空，老代码照常写入',
      "await queryRunner.query('ALTER TABLE posts ADD COLUMN published_seq int unsigned NULL');",
      '// 第二步（下一版）：补完数据后再加唯一索引',
      "await queryRunner.query('ALTER TABLE posts ADD UNIQUE KEY uk_posts_published_seq (published_seq)');",
      FENCE,
      '',
      '> 迁移文件一旦合进主干就不再修改；改错了，就再写一个。',
    ),
  },
  {
    slug: 'markdown-pipeline-consistency',
    title: 'Markdown 渲染管线怎么保持一致',
    summary: '后台预览正常、线上排版错乱、导出的 JSON 又是另一种样子——这是渲染逻辑写了两份的典型症状。',
    publishedAt: '2026-09-30T06:00:00.000Z',
    tagSlugs: ['engineering', 'build'],
    contentMd: md(
      '同一篇文章，后台预览正常、线上排版错乱、导出的 JSON 又是另一种样子。这是渲染逻辑写了两份的典型症状。',
      '',
      '## 一份实现，三个调用方',
      '',
      '- 预渲染：构建期把 Markdown 渲染成 HTML 写进静态页；',
      '- 后台预览：编辑时即时渲染；',
      '- 导出快照：备份与迁移。',
      '',
      '三处的入参出参完全一致，因此规则只能写一次——放在共享包里，两端都引它。',
      '',
      '## 目录锚点为什么不用标题文字',
      '',
      '用标题生成锚点看起来更友好，但改标题会让旧链接失效，重名标题还要去重。',
      '',
      `${FENCE}ts`,
      '// 解析阶段就分配锚点，HTML 与 headings 列表必然用同一套编号',
      'token.attrSet(\'id\', `t${counter}`);',
      FENCE,
      '',
      '代价是地址不好看（`#t3`），收益是链接永久有效、正文与目录永远一致。',
      '',
      '## 阅读时长也是派生值',
      '',
      '字数除以 400，加上代码行数除以 20，取整并保底 1 分钟。这个值由后端算好随详情返回，前端只负责显示。',
      '',
      '> 派生值只算一次，比「两处算得一样」可靠得多。',
    ),
  },
  {
    slug: 'pnpm-workspace-minimal',
    title: 'pnpm workspace 的最小可行结构',
    summary: '三个包：前台、接口、共享契约。再少就没有意义，再多就是给自己找事。',
    publishedAt: '2026-09-21T14:15:00.000Z',
    tagSlugs: ['engineering', 'build'],
    contentMd: md(
      '三个包：前台、接口、共享契约。没有比这更小的可行结构了。',
      '',
      '## 目录',
      '',
      `${FENCE}text`,
      'tiny-blogs/',
      '  apps/web        # 前台',
      '  apps/api        # 接口',
      '  packages/shared # 契约：类型、常量、纯函数',
      FENCE,
      '',
      '## 为什么共享包不出双产物',
      '',
      '接口是 CommonJS（装饰器元数据依赖它），前台是 ESM。第一反应是双产物，但那意味着两套构建、两份 sourcemap、两种解析行为。',
      '',
      '现在的做法是只出 CJS 单产物，前台通过构建器的 `commonjsOptions.include` 把它纳入转换范围。代价是构建配置里多一行，收益是共享包只有一种行为。',
      '',
      `${FENCE}ts`,
      'commonjsOptions: { include: [/node_modules/, /packages\\/shared\\//] }',
      FENCE,
      '',
      '## 脚本收敛在根目录',
      '',
      '`pnpm -r` 递归跑，根 `package.json` 只留人真正会敲的命令：`dev`、`build`、`test`、`db:reset`。',
      '',
      '> workspace 的收益不是少装一次依赖，而是改了契约立刻能验证两端都还编译得过。',
    ),
  },
  {
    slug: 'render-function-escape-hatch',
    title: '把渲染函数当成模板的逃生舱',
    summary: '模板能表达九成的界面。剩下那一成硬写模板会变成一堆 v-if 的意大利面，这时候换渲染函数。',
    publishedAt: '2026-09-12T02:05:00.000Z',
    tagSlugs: ['vue', 'engineering'],
    contentMd: md(
      '模板能表达九成的界面。剩下那一成，硬写模板会变成一堆 `v-if` 的意大利面。',
      '',
      '## 什么时候该换',
      '',
      '- 需要根据数据动态选择标签名；',
      '- 需要精确控制子节点的位置与数量；',
      '- 需要把插槽内容重新组合。',
      '',
      '## 例子：把目录拍平',
      '',
      `${FENCE}ts`,
      'const TocList = defineComponent({',
      '  props: { headings: { type: Array as PropType<Heading[]>, required: true } },',
      '  setup(props) {',
      '    return () =>',
      '      h(',
      "        'ol',",
      '        props.headings.map((heading) =>',
      "          h('li', { class: heading.level === 3 ? 'lv3' : undefined }, [",
      '            h(\'a\', { href: `#${heading.id}` }, heading.text),',
      '          ]),',
      '        ),',
      '      );',
      '  },',
      '});',
      FENCE,
      '',
      '## 代价',
      '',
      '渲染函数没有模板的静态提升，diff 时也少了一层编译期优化。所以只在模板真的写不干净的地方用它，不要为了炫技把整页改成 `h()`。',
      '',
      '> 逃生舱的意义是逃生，不是住进去。',
    ),
  },
  {
    slug: 'compose-mysql-only',
    title: 'compose 只跑 MySQL 的理由',
    summary: '本地环境只容器化最容易漂移的那部分：数据库。应用留在宿主机上跑，热更新和断点都更省事。',
    publishedAt: '2026-09-03T09:45:00.000Z',
    tagSlugs: ['engineering', 'backend'],
    contentMd: md(
      '本地开发用 docker compose，但只跑一个 MySQL 容器，接口和前台都在宿主机上跑。',
      '',
      '## 为什么不全都容器化',
      '',
      '1. 热更新：`--watch` 在宿主机上比在挂载卷里快一个数量级；',
      '2. 调试：断点直接打在源码路径上，不用配路径映射；',
      '3. 依赖：`node_modules` 不用在容器与宿主之间来回同步。',
      '',
      '## 只跑 MySQL 的理由',
      '',
      '数据库是唯一「装在宿主机上很麻烦」的东西：版本要固定、字符集要固定、初始化要可重复。容器刚好解决这三件事。',
      '',
      `${FENCE}yaml`,
      'services:',
      '  db:',
      '    image: mysql:8.4',
      '    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci',
      '    environment:',
      '      MYSQL_DATABASE: tiny_blogs',
      '      MYSQL_ROOT_PASSWORD: dev_only_password',
      "    ports: ['3306:3306']",
      '    healthcheck:',
      "      test: ['CMD', 'mysqladmin', 'ping', '-h', '127.0.0.1']",
      '      interval: 3s',
      '      retries: 20',
      FENCE,
      '',
      '## 一条命令起库',
      '',
      '`db:up` 等到健康检查通过再返回，这样迁移脚本不用自己重试。',
      '',
      '> 把环境里最容易漂移的那部分锁住就够了，不必把整个开发流程塞进容器。',
    ),
  },
  {
    slug: 'keyboard-shortcuts-tradeoff',
    title: '键盘快捷键的取舍',
    summary: '草稿：后台编辑器的快捷键一直在加，趁重构做一次减法。',
    publishedAt: null,
    tagSlugs: ['engineering'],
    contentMd: md(
      '后台编辑器的快捷键一直在加，今天趁着重构做了一次减法。',
      '',
      '## 加容易，减难',
      '',
      '每加一个组合键，就有一个已有组合键被抢走。三个月下来，保存键旁边挤了七个「看起来也很常用」的快捷键。',
      '',
      '## 判断标准',
      '',
      '只保留三类：保存、发布、撤销。其余全部走按钮。',
      '',
      '> 快捷键的价值在于肌肉记忆，而肌肉记忆的容量很小。',
    ),
  },
];

/**
 * 确保标签存在，返回 `slug → id`。
 *
 * 命中规则：`slug` 或 `name` 任一相同即复用（两者都有唯一索引，先查后插最稳）。
 *
 * @param dataSource 已初始化的数据源。
 * @returns 标签 id 映射。
 */
async function upsertTags(dataSource: DataSource): Promise<Map<string, number>> {
  const ids = new Map<string, number>();

  for (const tag of DEMO_TAGS) {
    const existing = await dataSource.query<Array<{ id: number | string }>>(
      'SELECT id FROM tags WHERE slug = ? OR name = ? LIMIT 1',
      [tag.slug, tag.name],
    );
    const found = existing[0];
    if (found !== undefined) {
      ids.set(tag.slug, Number(found.id));
      continue;
    }

    const inserted = (await dataSource.query('INSERT INTO tags (name, slug) VALUES (?, ?)', [
      tag.name,
      tag.slug,
    ])) as { insertId: number };
    ids.set(tag.slug, inserted.insertId);
  }

  return ids;
}

/**
 * 取下一个发布序号。
 *
 * @param dataSource 已初始化的数据源。
 * @returns `max(published_seq) + 1`；表里没有已发布文章时为 1。
 */
async function nextPublishedSeq(dataSource: DataSource): Promise<number> {
  const rows = await dataSource.query<Array<{ next: number | string }>>(
    'SELECT COALESCE(MAX(published_seq), 0) + 1 AS next FROM posts',
  );
  const row = rows[0];
  return row === undefined ? 1 : Number(row.next);
}

/**
 * 按 slug 写入一篇演示文章（不存在则建，存在则更新内容），并重建它的标签关联。
 *
 * @param dataSource 已初始化的数据源。
 * @param authorId 作者 id。
 * @param post 演示文章。
 * @param tagIds 标签 `slug → id`。
 * @returns `'created'` 或 `'updated'`。
 */
async function upsertPost(
  dataSource: DataSource,
  authorId: number,
  post: DemoPost,
  tagIds: ReadonlyMap<string, number>,
): Promise<'created' | 'updated'> {
  const published = post.publishedAt !== null;
  const status = published ? 'published' : 'draft';
  const publishedAt = post.publishedAt === null ? null : new Date(post.publishedAt);
  // 更新的时间戳恒等于发布时间：重复执行不会制造"刚刚改过"的假象，也不会推进乐观锁版本。
  const stamp = publishedAt ?? DRAFT_TIME;

  const existing = await dataSource.query<
    Array<{ id: number | string; published_seq: number | string | null; published_at: Date | null }>
  >('SELECT id, published_seq, published_at FROM posts WHERE slug = ? LIMIT 1', [post.slug]);
  const row = existing[0];

  let postId: number;
  let result: 'created' | 'updated';

  if (row === undefined) {
    const seq = published ? await nextPublishedSeq(dataSource) : null;
    const inserted = (await dataSource.query(
      `INSERT INTO posts
        (author_id, title, slug, summary, content_md, status, published_seq, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [authorId, post.title, post.slug, post.summary, post.contentMd, status, seq, publishedAt, stamp, stamp],
    )) as { insertId: number };
    postId = inserted.insertId;
    result = 'created';
  } else {
    postId = Number(row.id);
    await dataSource.query(
      'UPDATE posts SET title = ?, summary = ?, content_md = ?, status = ?, updated_at = ? WHERE id = ?',
      [post.title, post.summary, post.contentMd, status, stamp, postId],
    );

    // 曾经发布过、序号被人为清空（例如手工取消发布）：补回序号，避免曲目号出现空洞。
    if (published && (row.published_seq === null || row.published_at === null)) {
      await dataSource.query('UPDATE posts SET published_seq = ?, published_at = ? WHERE id = ?', [
        await nextPublishedSeq(dataSource),
        publishedAt,
        postId,
      ]);
    }
    result = 'updated';
  }

  // 关联表整体重建：标签可能被删掉或被改名，逐条 diff 不值得。
  await dataSource.query('DELETE FROM post_tags WHERE post_id = ?', [postId]);
  for (const tagSlug of post.tagSlugs) {
    const tagId = tagIds.get(tagSlug);
    if (tagId === undefined) {
      throw new Error(`演示数据引用了未定义的标签：${tagSlug}`);
    }
    await dataSource.query('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)', [postId, tagId]);
  }

  return result;
}

/**
 * 脚本入口。
 */
async function main(): Promise<void> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    const env = readApiEnv();

    // 文章必须挂在作者上：先确保管理员存在，再取它的 id。
    const seeded = await ensureAdminUser(dataSource, {
      username: env.admin.username,
      password: env.admin.password,
    });
    const authors = await dataSource.query<Array<{ id: number | string }>>(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [env.admin.username],
    );
    const author = authors[0];
    if (author === undefined) {
      throw new Error(`找不到作者账号 ${env.admin.username}，seed 中止`);
    }
    const authorId = Number(author.id);

    const tagIds = await upsertTags(dataSource);

    let created = 0;
    let updated = 0;
    for (const post of DEMO_POSTS) {
      const result = await upsertPost(dataSource, authorId, post, tagIds);
      if (result === 'created') {
        created += 1;
      } else {
        updated += 1;
      }
      const label = post.publishedAt === null ? '草稿' : post.publishedAt.slice(0, 10);
      process.stdout.write(`  ${result === 'created' ? '新建' : '更新'} ${label}  ${post.slug}\n`);
    }

    const draftCount = DEMO_POSTS.filter((post) => post.publishedAt === null).length;
    process.stdout.write(
      `演示数据就绪：${String(created)} 篇新建、${String(updated)} 篇更新（其中 ${String(draftCount)} 篇草稿），` +
        `${String(tagIds.size)} 个标签；管理员 ${seeded === 'created' ? '本次新建' : '已存在'}：${env.admin.username}\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`演示数据写入失败：${message}\n`);
  process.exitCode = 1;
});
