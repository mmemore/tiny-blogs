/**
 * 构建期脚本共用的「拉内容快照」步骤。
 *
 * `pnpm release`（本地发布）与 `pnpm content:export`（写仓库静态内容）都会：
 * 读令牌 → 带 `X-Build-Token` 请求 `GET /api/build/export` → 校验形状 → 打一行摘要。
 * 这段逻辑只写一次，两条链路的失败文案与校验口径才不会漂移。
 *
 * 令牌只在本进程内使用，不写日志、不落盘。
 */
import { readEnvValue } from './env.mjs';

/** 默认的导出接口地址（本地 API）。 */
const DEFAULT_EXPORT_URL = 'http://127.0.0.1:3000/api/build/export';

/**
 * 拉取并校验内容快照。
 *
 * @param {{ log: (message: string) => void, fail: (message: string) => never }} io
 *   日志与失败回调（各自带脚本自己的前缀，失败即退出）。
 * @returns {Promise<Record<string, unknown>>} 形状合法的快照。
 */
export async function fetchSnapshot({ log, fail }) {
  const token = readEnvValue('BUILD_EXPORT_TOKEN');
  if (token === '') {
    fail('BUILD_EXPORT_TOKEN 未设置（检查 .env 或当前进程环境）');
  }

  const exportUrl = readEnvValue('BUILD_EXPORT_URL') || DEFAULT_EXPORT_URL;
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
  return snapshot;
}
