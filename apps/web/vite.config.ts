import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
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
    // Tailwind v4 走 Vite 插件而不是 PostCSS：`styles/tokens.css` 里的 `@import 'tailwindcss'`
    // 与 `@theme` 由它在构建期展开，令牌因此只有一份来源。
    plugins: [vue(), tailwindcss()],
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
      rollupOptions: {
        output: {
          /**
           * 共享契约包单独成块。
           *
           * 为什么需要这一步：`@tiny-blogs/shared` 按 ADR-0005 只出 CJS 单产物，
           * 而 CJS 无法按导出做 tree-shaking——它的 `index` 里 `export * from './markdown'`，
           * 于是 markdown-it 与 highlight.js（约 400 KB）会跟着**任何**一次 `import` 进来，
           * 哪怕页面只用了一个 `DEFAULT_PAGE_SIZE`。
           *
           * 切成独立的 chunk 之后：应用壳（`index-*.js`）回到百 KB 量级，
           * 渲染器只在真正调用 `renderMarkdown` 的页面（关于页）执行，且全站共用一份、可长期缓存。
           * 也就是说：**详情页依然不解析 Markdown**（它只 v-html 接口给的 `html`），
           * 关于页才需要渲染器，这是票 07 明确要求的"本地 Markdown + 共享渲染器"。
           */
          manualChunks: {
            contract: ['@tiny-blogs/shared'],
          },
        },
      },
    },
  };
});
