/**
 * `.env` 加载器。
 *
 * monorepo 里 `.env` 只有一份，放在仓库根目录（与 `.env.example` 同目录），
 * 而各个包的命令可能从任意子目录启动，所以这里从 `process.cwd()` 向上找
 * `pnpm-workspace.yaml` 来确定仓库根。
 *
 * 规则：
 * - 已存在的 `process.env` 优先（方便一次性覆盖某个变量）。
 * - 找不到 `.env` 不报错：CI/生产用真实环境变量注入，此时不应依赖文件。
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotenvFile } from 'dotenv';

/** 用于确定 monorepo 根目录的锚点文件。 */
const WORKSPACE_ANCHOR = 'pnpm-workspace.yaml';

let loadedOnce = false;

/**
 * 从给定目录向上查找 monorepo 根目录。
 *
 * @param startDir 起始目录（通常是 `process.cwd()`）。
 * @returns 仓库根目录绝对路径；找不到返回 `null`。
 */
function findWorkspaceRoot(startDir: string): string | null {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(join(current, WORKSPACE_ANCHOR))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * 加载 `.env`（幂等）。
 *
 * @returns 实际加载的文件绝对路径；未加载任何文件时返回 `null`。
 */
export function loadEnvFile(): string | null {
  if (loadedOnce) {
    return null;
  }
  loadedOnce = true;

  const explicitPath = process.env.ENV_FILE;
  let candidate: string | null = null;

  if (typeof explicitPath === 'string' && explicitPath.trim() !== '') {
    candidate = resolve(explicitPath.trim());
  } else {
    const root = findWorkspaceRoot(process.cwd());
    candidate = root === null ? null : join(root, '.env');
  }

  if (candidate === null || !existsSync(candidate)) {
    return null;
  }

  // override: false —— 真实环境变量优先于文件内容。
  loadDotenvFile({ path: candidate, override: false });
  return candidate;
}

/**
 * 仅在测试里重置内部状态，避免"加载一次"的缓存干扰用例。
 */
export function resetEnvFileLoaderForTests(): void {
  loadedOnce = false;
}
