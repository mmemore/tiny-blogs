import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import type { ViteSSGOptions } from 'vite-ssg';
import { defineConfig, loadEnv } from 'vite';

/**
 * vite-ssg 的选项挂在 vite 配置的顶层（`build()` 里 `config.ssgOptions` 读取）。
 * vite 本身没有这个字段，这里做一次模块扩展让类型完整。
 */
declare module 'vite' {
  interface UserConfig {
    /** 预渲染选项；仅 `vite-ssg build` 读取，普通 SPA 构建忽略。 */
    ssgOptions?: ViteSSGOptions;
  }
}

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
    /**
     * 预渲染选项（票 10）。只在 `vite-ssg build`（即 `pnpm release`）时生效；
     * 普通 `pnpm build` 仍然是 SPA，`ssgOptions` 被完全忽略。
     */
    ssgOptions: {
      // `nested`：`/posts/<slug>` 落成 `dist/posts/<slug>/index.html`，
      // 静态托管无需 rewrite 规则，URL 与目录一一对应（冒烟脚本也按这个布局断言）。
      dirStyle: 'nested',
    },
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
        /**
         * `/uploads/**` 也要代理到 API。
         *
         * 上传接口返回的是**站内相对路径**（`/uploads/2026/11/ab12cd34.png`），
         * 而静态服务挂在 API 进程上、且故意不在 `/api` 前缀下（图片 URL 不该带 API 版本语义）。
         * 不代理这一条，开发时后台上传成功、预览图全是 404。
         * 生产由反向代理把这两个前缀一起转给 API（见 ADR-0005）。
         */
        '/uploads': {
          target: proxy.origin,
          changeOrigin: true,
        },
      },
    },
    build: {
      // `pnpm release` 的原子替换要求先构建到 `dist-next`，成功后再整体改名 `dist`。
      // 平时不设置该变量，走默认 `dist`（见 scripts/release.mjs）。
      outDir: process.env.RELEASE_OUT_DIR ?? 'dist',
      emptyOutDir: true,
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
           *
           * 用函数而不是 `{ contract: [...], admin: [...] }` 对象形式的原因：
           * `vite-ssg` 的 **SSR 构建**把所有依赖标成 external，而对象形式会预先解析出
           * 模块 id 并强行入块，Rollup 直接报
           * `EXTERNAL_MODULES_CANNOT_BE_INCLUDED_IN_MANUAL_CHUNKS`。
           * 函数形式只对**真正被打进图里**的模块调用，SSR 构建自然跳过。
           */
          manualChunks(id: string): string | undefined {
            /** 统一成正斜杠，避免 Windows 反斜杠路径漏判。 */
            const normalized = id.replaceAll('\\', '/');
            if (normalized.includes('/packages/shared/')) {
              return 'contract';
            }
            /**
             * 后台组件库单独成块。
             *
             * 它只被 `/admin` 子树（懒加载路由）引用，切出来之后：
             * 1. 前台入口 chunk 里不会出现 `naive-ui` 的任何字节（构建后可直接 grep 断言）；
             * 2. 后台各页面之间共享同一份组件库，不会每个页面各背一份。
             */
            if (/\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?naive-ui\//.test(normalized)) {
              return 'admin';
            }
            return undefined;
          },
        },
      },
    },
  };
});
