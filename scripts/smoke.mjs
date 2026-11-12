/**
 * `pnpm smoke`：构建冒烟脚本。
 *
 * 无浏览器依赖，只检查 dist 产物 + 内容快照的交叉一致性
 * （快照来源：CI 用 `content/snapshot.json`，本地 release 用 `.release/snapshot.json`）：
 * 1. 关键页面存在：5 个静态页 + 每个快照 slug 的 `posts/<slug>/index.html`；
 * 2. 文章页 HTML **直接含正文**：快照第一篇的第一个 `## ` 小节文本；
 *    每篇文章页含 `<title>`、`og:title`、`og:description`（= summary）、
 *    `article:published_time`；
 * 3. 结构性证明草稿不产生路由：`dist/posts/` 目录集合 === 快照 slug 集合，
 *    且 `dist/admin/` 不存在；
 * 4. 零第三方字体直连：`fonts.googleapis.com` / `fonts.gstatic.com` 不出现；
 * 5. 密钥零泄漏：`BUILD_EXPORT_TOKEN` 实际值不出现在任何 dist 文件里；
 * 6. 静态内容模式的运行时快照已进产物：`dist/content/snapshot.json` 存在
 *    （客户端水合后的翻页/搜索全靠它）。
 *
 * 任一断言失败：打印清晰差异清单并以非 0 退出。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 项目根目录（`fileURLToPath` 跨平台正确处理 Windows 盘符）。 */
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const WEB_DIR = resolve(ROOT, 'apps/web');
const DIST = resolve(WEB_DIR, 'dist');
// 快照来源跟随构建参数：CI（`CONTENT_SNAPSHOT_FILE=content/snapshot.json`）读仓库里
// 提交的内容文件，本地 release 默认读 `.release/snapshot.json`——同一套断言两边通用。
const SNAPSHOT_PATH = process.env.CONTENT_SNAPSHOT_FILE
  ? resolve(ROOT, process.env.CONTENT_SNAPSHOT_FILE)
  : resolve(ROOT, '.release', 'snapshot.json');

const failures = [];
/** 断言计数（通过的断言数，用于汇总输出）。 */
let passed = 0;

function ok(message) {
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function bad(message) {
  failures.push(message);
  console.error(`  ✗ ${message}`);
}

/** 断言函数：condition 为真记通过，否则记失败。 */
function assert(condition, message) {
  if (condition) {
    ok(message);
  } else {
    bad(message);
  }
}

/**
 * 读根目录 `.env` 的一个键（`process.env` 优先）。不把值打印到任何地方。
 */
function readEnvValue(key) {
  if (process.env[key] !== undefined && process.env[key] !== '') {
    return process.env[key];
  }
  try {
    const lines = readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/);
    const line = lines.find((l) => l.startsWith(`${key}=`));
    if (line === undefined) {
      return '';
    }
    return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
  } catch {
    return '';
  }
}

/** HTML 实体转义（与 vue/server-renderer 输出对齐的最小集合）。 */
function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** HTML 实体反转义（把产物里的文本还原成人可读的值再比对）。 */
function decodeHtml(text) {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/**
 * 取 `<title>` 的文本。
 *
 * @param html 页面 HTML。
 * @returns 解码后的标题；没有则 `null`。
 */
function titleText(html) {
  const match = /<title>([^<]*)<\/title>/.exec(html);
  return match === null ? null : decodeHtml(match[1]);
}

/**
 * 取某个 `<meta>` 的 content（按 `property` 或 `name` 匹配）。
 *
 * 必须精确取值再比对：只在整篇 HTML 里 `includes()` 会被正文里的同名文本蒙混过关
 * （第一次实跑就是靠这个假通过，掩盖了"所有文章页 head 都是同一篇"的 bug）。
 *
 * @param html 页面 HTML。
 * @param key `og:title` / `article:published_time` / `description` 之类。
 * @returns 解码后的 content；没有该标签则 `null`。
 */
function metaContent(html, key) {
  const pattern = new RegExp(`<meta[^>]*(?:property|name)="${key}"[^>]*content="([^"]*)"`);
  const match = pattern.exec(html);
  return match === null ? null : decodeHtml(match[1]);
}

/** 递归收集目录下所有文件（相对 DIST 的 posix 路径）。 */
function walkFiles(dir, baseDir = dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkFiles(full, baseDir));
    } else {
      files.push(full.slice(baseDir.length + 1).replaceAll('\\', '/'));
    }
  }
  return files;
}

// ---- 0. 前置条件 ----
console.log('[smoke] 检查前置条件...');
if (!existsSync(SNAPSHOT_PATH)) {
  console.error(`[smoke] FAIL: 快照不存在（${SNAPSHOT_PATH}）——本地先跑 \`pnpm release\`；CI 检查 CONTENT_SNAPSHOT_FILE 是否指向已提交的 content/snapshot.json。`);
  process.exit(1);
}
if (!existsSync(DIST)) {
  console.error('[smoke] FAIL: apps/web/dist 不存在——先跑 `pnpm release`。');
  process.exit(1);
}
/** @type {import('./types').any} 快照 JSON（形状由 release 脚本校验过）。 */
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const posts = snapshot.posts;
if (snapshot?.version !== 1 || !Array.isArray(posts) || posts.length === 0) {
  console.error('[smoke] FAIL: 快照形状不合法或为空（version !== 1 / posts 非数组 / 0 篇）。');
  process.exit(1);
}
const allFiles = walkFiles(DIST);
console.log(`[smoke] dist 共 ${String(allFiles.length)} 个文件，快照 ${String(posts.length)} 篇已发布。`);

// ---- 1. 关键页面存在 ----
console.log('[smoke] 1/6 关键页面存在');
const staticPages = ['index.html', 'posts/index.html', 'tags/index.html', 'archives/index.html', 'about/index.html'];
for (const page of staticPages) {
  assert(allFiles.includes(page), `存在 ${page}`);
}
for (const post of posts) {
  const page = `posts/${post.slug}/index.html`;
  assert(allFiles.includes(page), `存在 ${page}`);
}

// ---- 2. 文章页 HTML 直接含正文 + meta ----
console.log('[smoke] 2/6 文章页正文与 meta');
const readPostHtml = (slug) => readFileSync(join(DIST, 'posts', slug, 'index.html'), 'utf8');

// 正文特征串：快照第一篇的第一个 `## ` 小节标题文本
const firstPost = posts[0];
const firstHeading = /^##\s+(.+)$/m.exec(firstPost.contentMd);
if (firstHeading === null) {
  bad('快照第一篇 contentMd 中找不到 `## ` 小节，无法取正文特征串');
} else {
  const headingText = firstHeading[1].trim();
  const html = readPostHtml(firstPost.slug);
  const hit = html.includes(headingText) || html.includes(escapeHtml(headingText));
  assert(hit, `第一篇《${firstPost.title}》HTML 直接含正文小节「${headingText}」`);
}

for (const post of posts) {
  const html = readPostHtml(post.slug);
  const label = `posts/${post.slug}/`;
  const title = titleText(html);
  assert(title !== null && title.startsWith(post.title), `${label}<title> = 「${post.title}…」`);
  // `og:title` 与 `<title>` 同值（都带 ` · 站点名` 后缀）：社交卡片与标签页不该有两套标题。
  assert(metaContent(html, 'og:title') === title, `${label}og:title = <title>`);
  assert(metaContent(html, 'og:description') === post.summary, `${label}og:description = summary`);
  assert(
    post.publishedAt !== null && metaContent(html, 'article:published_time') === post.publishedAt,
    `${label}article:published_time = ${String(post.publishedAt)}`,
  );
  // 每页正文必须是**它自己**的内容：同一篇被复用会让下面这条直接红
  const ownHeading = /^##\s+(.+)$/m.exec(post.contentMd);
  if (ownHeading !== null) {
    const heading = ownHeading[1].trim();
    assert(
      html.includes(heading) || html.includes(escapeHtml(heading)),
      `${label}正文小节「${heading}」属于本篇`,
    );
  }
}

// ---- 3. 草稿不产生路由（结构证明） ----
console.log('[smoke] 3/6 草稿不产生路由');
assert(!existsSync(join(DIST, 'admin')), 'dist/admin/ 不存在（/admin 不参与预渲染）');
const postsDir = join(DIST, 'posts');
/** dist/posts 下的子目录集合（即生成的文章路由）。 */
const generatedSlugs = statSync(postsDir).isDirectory()
  ? readdirSync(postsDir).filter((entry) => statSync(join(postsDir, entry)).isDirectory()).sort()
  : [];
const expectedSlugs = posts.map((post) => post.slug).sort();
const extra = generatedSlugs.filter((slug) => !expectedSlugs.includes(slug));
const missing = expectedSlugs.filter((slug) => !generatedSlugs.includes(slug));
assert(
  extra.length === 0 && missing.length === 0,
  `dist/posts 目录集合 === 快照 slug 集合${extra.length > 0 ? `；多出: ${extra.join(', ')}` : ''}${missing.length > 0 ? `；缺失: ${missing.join(', ')}` : ''}`,
);

// ---- 4. 零第三方字体直连 ----
console.log('[smoke] 4/6 零第三方字体直连');
const fontHits = allFiles.filter((file) => {
  if (!/\.(html|js|css)$/.test(file)) {
    return false;
  }
  const content = readFileSync(join(DIST, file), 'utf8');
  return content.includes('fonts.googleapis.com') || content.includes('fonts.gstatic.com');
});
assert(fontHits.length === 0, `fonts.googleapis.com / fonts.gstatic.com 零命中${fontHits.length > 0 ? `（命中: ${fontHits.slice(0, 5).join(', ')}${fontHits.length > 5 ? ' 等' : ''}）` : ''}`);

// ---- 5. 密钥零泄漏 ----
console.log('[smoke] 5/6 密钥零泄漏');
const buildToken = readEnvValue('BUILD_EXPORT_TOKEN');
if (buildToken === '') {
  // CI 环境本来就不注入任何 secret（读不到是正常的）；本地读不到才是异常，
  // 说明发布链路配置缺失，泄漏检查失去了前提。
  if (process.env.CI === 'true') {
    ok('CI 环境未注入 BUILD_EXPORT_TOKEN，跳过泄漏检查（CI 本无任何 secret）');
  } else {
    bad('BUILD_EXPORT_TOKEN 读不到（.env 或环境）——无法做泄漏检查');
  }
} else {
  const tokenHits = allFiles.filter((file) => readFileSync(join(DIST, file), 'utf8').includes(buildToken));
  assert(tokenHits.length === 0, `BUILD_EXPORT_TOKEN 实际值在 dist 中零命中${tokenHits.length > 0 ? `（泄漏于: ${tokenHits.slice(0, 5).join(', ')}）` : ''}`);
}

// ---- 6. 静态内容模式的运行时快照 ----
console.log('[smoke] 6/6 静态内容模式的运行时快照');
assert(
  existsSync(join(DIST, 'content', 'snapshot.json')),
  'dist/content/snapshot.json 存在（客户端水合后的取数依赖它）',
);

// ---- 汇总 ----
if (failures.length > 0) {
  console.error('');
  console.error(`[smoke] FAIL：${String(failures.length)} 项断言未通过 / 共 ${String(passed + failures.length)} 项：`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log('');
console.log(`[smoke] PASS：${String(passed)} 项断言全部通过。`);
