/**
 * 共享的小工具：读取根目录 `.env` 的一个键（`process.env` 优先）。
 *
 * 供 `release.mjs` / `export-content.mjs` / `ship.mjs` 等构建期脚本共用，
 * 保证"读环境变量"只有一份实现；值永远不会被打印到任何地方。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根目录（`fileURLToPath` 跨平台正确处理 Windows 盘符；本文件在 scripts/lib/ 下，需上溯三级）。 */
export const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

/**
 * 读取一个环境变量：`process.env` 优先，其次根目录 `.env`。
 *
 * @param {string} key 变量名。
 * @returns {string} 值或空串。
 */
export function readEnvValue(key) {
  if (process.env[key] !== undefined && process.env[key] !== '') {
    return process.env[key];
  }
  try {
    const lines = readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/);
    const line = lines.find((candidate) => candidate.startsWith(`${key}=`));
    if (line === undefined) {
      return '';
    }
    return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
  } catch {
    return '';
  }
}
