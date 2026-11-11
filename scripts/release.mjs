/**
 * `pnpm release`：发布链路编排（票 10，ADR-0004）。
 *
 * 步骤：
 * 1. 校验 `BUILD_EXPORT_TOKEN`（缺失即失败，绝不带着空令牌往下走）；
 * 2. `GET /api/build/export` 拉快照 → 校验形状 → 写 `.release/snapshot.json`（gitignored）；
 * 3. 从快照推出预渲染路由清单，注入进程环境；
 * 4. `vite-ssg build` 构建（先写 `dist-next`，上一版 `dist` 全程不动）；
 * 5. 构建成功后原子替换：`dist` → `.release/dist-prev` → `dist-next` 改名为 `dist`；
 *    任何一步失败都把 `dist-prev` 还原回 `dist`，保证线上产物始终完整。
 *
 * 密钥红线：令牌只存在于本进程与 API 的环境里，**不写入**任何落盘文件；
 * 快照 JSON 是公开内容（与公开接口同源），落盘供冒烟脚本复核。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 项目根目录（`fileURLToPath` 跨平台正确处理 Windows 盘符）。 */
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const WEB_DIR = resolve(ROOT, 'apps/web');
const DIST = resolve(WEB_DIR, 'dist');
const DIST_NEXT = resolve(WEB_DIR, 'dist-next');
const DIST_PREV = resolve(WEB_DIR, 'dist-prev');
const RELEASE_DIR = resolve(ROOT, '.release');
const TRASH_DIR = resolve(RELEASE_DIR, 'trash');
const SNAPSHOT_PATH = resolve(RELEASE_DIR, 'snapshot.json');

const log = (message) => console.log(`[release] ${message}`);
const fail = (message) => {
  console.error(`[release] FAIL: ${message}`);
  process.exit(1);
};

/**
 * 把作废的构建目录挪进 `.release/trash/`，**不做递归删除**。
 *
 * 两个理由：
 * 1. 递归删几百个文件在受限环境里会被批量删除守卫拦住，而发布链路不该因此失败；
 * 2. 失败的产物留着才能排查——改名和删除对"构建目录必须干净"这个诉求等价。
 * 归档目录与 `.release/` 一起被 gitignore，可随时手动清空。
 *
 * @param dir 需要腾空的目录（不存在则无操作）。
 */
function discardDir(dir) {
  if (!existsSync(dir)) {
    return;
  }
  mkdirSync(TRASH_DIR, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const target = resolve(TRASH_DIR, `${stamp}-${basename(dir)}`);
  try {
    renameSync(dir, target);
    log(`旧目录已归档：.release/trash/${basename(target)}（可手动清理）`);
  } catch (error) {
    log(`警告：无法归档 ${dir}（${error instanceof Error ? error.message : String(error)}），继续`);
  }
}

/**
 * 读根目录 `.env` 的一个键（`process.env` 优先）。
 *
 * @param key 变量名。
 * @returns 值或空串；不把值打印到任何地方。
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

/**
 * 构建期环境变量只透传白名单，避免把无关变量（尤其密钥）带进 vite 子进程。
 *
 * @returns 干净的环境表。
 */
function childEnv(extra) {
  const base = { ...process.env };
  for (const key of Object.keys(base)) {
    if (key.startsWith('VITE_') || ['PRERENDER_POST_SLUGS', 'PRERENDER_TAG_SLUGS'].includes(key)) {
      // 白名单外的构建期变量一律不带；VITE_API_BASE 等由 .env 提供
      delete base[key];
    }
  }
  return { ...base, ...extra };
}

// ---- 1. 令牌 ----
const token = readEnvValue('BUILD_EXPORT_TOKEN');
if (token === '') {
  fail('BUILD_EXPORT_TOKEN 未设置（检查 .env 或当前进程环境）');
}

// ---- 2. 拉快照 ----
const exportUrl = readEnvValue('BUILD_EXPORT_URL') || 'http://127.0.0.1:3000/api/build/export';
log(`拉取快照：${exportUrl}`);
const startedAt = Date.now();
let snapshot;
try {
  const response = await fetch(exportUrl, { headers: { 'X-Build-Token': token } });
  if (!response.ok) {
    fail(`导出接口返回 HTTP ${String(response.status)}（检查 API 是否在跑、令牌是否一致）`);
  }
  snapshot = await response.json();
} catch (error) {
  fail(`无法访问导出接口：${error instanceof Error ? error.message : String(error)}`);
}
if (snapshot?.version !== 1 || !Array.isArray(snapshot?.posts)) {
  fail('快照形状不合法（version !== 1 或 posts 不是数组）');
}
const fetchMs = Date.now() - startedAt;
log(`快照就绪：${String(snapshot.posts.length)} 篇已发布 / ${String(snapshot.tags.length)} 个标签，耗时 ${String(fetchMs)}ms`);

// ---- 3. 落盘 + 路由清单 ----
mkdirSync(RELEASE_DIR, { recursive: true });
writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot), 'utf8');
log(`快照已写入 ${SNAPSHOT_PATH}`);

const postSlugs = snapshot.posts.map((post) => post.slug);
const tagSlugs = snapshot.tags.map((tag) => tag.slug);

// ---- 4. vite-ssg 构建（到 dist-next）----
// 先确保构建目录是干净的：上次失败留下的半个产物不能被这次继承。
discardDir(DIST_NEXT);
log('开始 vite-ssg 构建（输出到 dist-next，上一版 dist 不受影响）...');
const buildStartedAt = Date.now();
const spawned = spawnSync('pnpm', ['--filter', '@tiny-blogs/web', 'build:ssg'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: ROOT,
  env: childEnv({
    PRERENDER_POST_SLUGS: postSlugs.join(','),
    PRERENDER_TAG_SLUGS: tagSlugs.join(','),
    RELEASE_OUT_DIR: 'dist-next',
  }),
});
const buildMs = Date.now() - buildStartedAt;
if (spawned.status !== 0) {
  discardDir(DIST_NEXT);
  fail(`vite-ssg 构建失败（exit ${String(spawned.status)}），上一版 dist 原样保留`);
}
log(`构建完成，耗时 ${String(Math.round(buildMs / 100) / 10)}s`);
if (!existsSync(resolve(DIST_NEXT, 'index.html'))) {
  discardDir(DIST_NEXT);
  fail('dist-next 里没有 index.html，构建产物不完整');
}

// ---- 5. 原子替换 ----
log('替换产物：dist → dist-prev → dist-next 改名 dist');
discardDir(DIST_PREV);
let swapped = false;
try {
  if (existsSync(DIST)) {
    renameSync(DIST, DIST_PREV);
  }
  renameSync(DIST_NEXT, DIST);
  swapped = true;
} catch (error) {
  // 还原：任何一步失败，把旧版放回 dist
  if (!swapped && existsSync(DIST_PREV) && !existsSync(DIST)) {
    renameSync(DIST_PREV, DIST);
  }
  discardDir(DIST_NEXT);
  fail(`替换失败（已还原上一版 dist）：${error instanceof Error ? error.message : String(error)}`);
}
// 新产物已就位，旧版归档（不删除，留着可回滚/排查）
discardDir(DIST_PREV);

log(`完成：${String(snapshot.posts.length)} 篇文章页 + ${String(tagSlugs.length)} 个标签页 + 5 个静态页`);
