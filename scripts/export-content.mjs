/**
 * `pnpm content:export`：把本地数据库的公开内容落成仓库里的静态文件。
 *
 * 这是"写作在本地、发布到静态托管"链路的第一步（ADR-0004 的 Pages 形态）：
 * 1. 带 `X-Build-Token` 请求本地 API 的 `GET /api/build/export` 拿 `ContentSnapshot`
 *    （与 `pnpm release` 同一个接口、同一个令牌，写入 `content/snapshot.json`）；
 * 2. 把上传目录（`UPLOAD_DIR`，默认 `var/uploads`）镜像到 `content/uploads/`——
 *    图片 key 是内容哈希，镜像即幂等；CI 从这两个目录构建线上站，全程不需要数据库。
 *
 * 快照与上传图片都是**公开内容**（与公开接口同源），入库不涉及任何 secret。
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, readEnvValue } from './lib/env.mjs';

const CONTENT_DIR = resolve(ROOT, 'content');
const SNAPSHOT_PATH = resolve(CONTENT_DIR, 'snapshot.json');

const log = (message) => console.log(`[content:export] ${message}`);
const fail = (message) => {
  console.error(`[content:export] FAIL: ${message}`);
  process.exit(1);
};

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
log(
  `快照就绪：${String(snapshot.posts.length)} 篇已发布 / ${String(snapshot.tags.length)} 个标签，耗时 ${String(Date.now() - startedAt)}ms`,
);

// ---- 3. 落盘（pretty JSON，git diff 可读）----
mkdirSync(CONTENT_DIR, { recursive: true });
writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
log(`快照已写入 ${SNAPSHOT_PATH}`);

// ---- 4. 镜像上传图片 ----
const uploadsSource = resolve(ROOT, readEnvValue('UPLOAD_DIR') || './var/uploads');
const uploadsTarget = resolve(CONTENT_DIR, 'uploads');
if (existsSync(uploadsSource)) {
  // 目标是脚本管理的生成目录，整体重建保证与源严格一致（删掉的图不会残留）。
  rmSync(uploadsTarget, { recursive: true, force: true });
  cpSync(uploadsSource, uploadsTarget, { recursive: true });
  log(`上传图片已镜像到 ${uploadsTarget}`);
} else {
  log(`上传目录不存在（${uploadsSource}），跳过图片镜像`);
}

log('完成。运行 `pnpm ship` 提交并推送，或直接手动 git 提交 content/ 目录。');
