import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

/**
 * 仓库根目录：`.env` 与 `pnpm-workspace.yaml` 都在这里，
 * 前端也从根目录读环境变量（`envDir`），保证只有一份配置清单。
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * 从 `VITE_API_BASE` 解析出 dev 代理目标。
 *
 * 开发期的浏览器请求走同源 `/api`，由 Vite 代理转发到 API，
 * 因此不需要给 API 开 CORS；生产用反向代理保持同源（见 ADR-0005）。
 *
 * @param apiBase `VITE_API_BASE`，形如 `http://127.0.0.1:3000/api`。
 * @returns 代理目标 origin 与需要代理的路径前缀。
 */
function resolveApiProxy(apiBase: string): { origin: string; path: string } {
  try {
    const parsed = new URL(apiBase);
    const path = parsed.pathname === '' ? '/' : parsed.pathname.replace(/\/$/, '');
    return { origin: parsed.origin, path };
  } catch {
    // 配置成相对路径时没有代理目标，退回本机默认端口（仍然只有一处默认值）。
    return { origin: 'http://127.0.0.1:3000', path: '/api' };
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const apiBase = env.VITE_API_BASE ?? 'http://127.0.0.1:3000/api';
  const proxy = resolveApiProxy(apiBase);

  return {
    envDir: repoRoot,
    plugins: [vue()],
    optimizeDeps: {
      // 共享包是 workspace 链接包，显式预打包才能稳定拿到其导出。
      include: ['@tiny-blogs/shared'],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        [proxy.path]: {
          target: proxy.origin,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      commonjsOptions: {
        // 共享包以 CommonJS 产物被两端引用（API 是 CJS），而它是 workspace 链接包，
        // 不在 node_modules 下，Rollup 默认的 commonjs 插件不会处理它。
        // 显式纳入转换范围，才能在生产构建里拿到具名导出的 interop。
        include: [/node_modules/, /packages[\\/]shared[\\/]/],
      },
    },
  };
});
