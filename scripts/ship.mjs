/**
 * `pnpm ship`：发布一篇（或一批）文章到静态托管的日常命令。
 *
 * 串联三步，全部可重入、无变更时自动跳过：
 * 1. `export-content.mjs`：本地 API 快照 → `content/snapshot.json` + 镜像上传图片；
 * 2. `git add content` + 无变更即止（重复运行第二次不会产生空提交）；
 * 3. `git push` —— 推上去之后由 GitHub Actions 全量预渲染并发布到 Pages。
 *
 * 密钥红线：本脚本只碰公开内容目录，不读取、不打印任何 secret 的值。
 */
import { spawnSync } from 'node:child_process';

const log = (message) => console.log(`[ship] ${message}`);
const fail = (message) => {
  console.error(`[ship] FAIL: ${message}`);
  process.exit(1);
};

/** 运行一个子进程，失败即终止。 */
function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    fail(`${label} 失败（exit ${String(result.status)}）`);
  }
}

/** 运行一个子进程并返回是否成功（用于探测性检查）。 */
function tryRun(command, args) {
  return spawnSync(command, args, { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0;
}

// ---- 0. 前置检查 ----
const hasRemote = tryRun('git', ['remote', 'get-url', 'origin']);
if (!hasRemote) {
  fail('没有配置 origin 远程仓库（git remote add origin <url> 后重试）');
}

// ---- 1. 导出内容 ----
run('node', ['scripts/export-content.mjs'], '导出内容');

// ---- 2. 提交 ----
run('git', ['add', 'content'], 'git add');

const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore', shell: process.platform === 'win32' });
if (staged.status === 0) {
  log('content/ 没有变更，无需发布。');
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 16).replaceAll(':', '-');
run('git', ['commit', '-m', `chore(content): publish snapshot ${stamp}`], 'git commit');

// ---- 3. 推送 ----
log('推送 origin...');
run('git', ['push'], 'git push');
log('已推送。GitHub Actions 正在全量重建，约 1-2 分钟后线上可见。');
