import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import type { ViteSSGOptions } from 'vite-ssg';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from 'vite';

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

/** 快照虚拟模块 id。 */
const SNAPSHOT_VIRTUAL_ID = 'virtual:content-snapshot';
const SNAPSHOT_RESOLVED_ID = `\0${SNAPSHOT_VIRTUAL_ID}`;

/**
 * 静态内容模式插件（发布链路的 Pages 部署形态，ADR-0004）。
 *
 * `VITE_STATIC_CONTENT=1` 时启用。该模式解决的是"静态托管上没有 API"：
 * - SSR（预渲染）构建：把 `CONTENT_SNAPSHOT_FILE` 指向的快照 JSON **内联**为虚拟模块，
 *   页面取数直接走快照查询，构建期不需要任何 API 进程；
 * - 客户端构建：虚拟模块导出 `null`，运行时按需 fetch 站点上的 `content/snapshot.json`
 *   （由本插件在构建收尾时拷进产物），水合后的翻页/搜索/标签筛选据此本地求值；
 * - 非静态模式（`pnpm dev` 与 API 模式构建）：虚拟模块导出 `null`，取数走 HTTP（见
 *   `api/content.ts` 的分流），行为与 ADR-0005 的同源代理完全一致。
 *
 * 为什么要用虚拟模块而不是直接读文件：客户端 bundle 里绝不允许出现 `node:fs`
 * 的任何字节——通过 `configResolved` 区分 SSR/客户端两次构建，为同一个虚拟 id
 * 输出不同的内容，分支在编译期就确定，运行时没有"猜环境"的逻辑。
 *
 * @param staticMode 是否启用静态内容模式。
 * @param snapshotFile 快照 JSON 路径（静态模式必需）。
 * @returns vite 插件。
 */
function contentSnapshotPlugin(staticMode: boolean, snapshotFile: string | undefined): Plugin {
  /** 当前构建是否是 SSR 侧（`configResolved` 每次构建都会回调一次）。 */
  let isSsrBuild = false;
  let resolved: ResolvedConfig | undefined;

  return {
    name: 'tiny-blogs:content-snapshot',
    configResolved(config) {
      resolved = config;
      // 客户端/SPA 构建 `build.ssr` 为 false，SSR 构建为入口文件路径。
      isSsrBuild = typeof config.build.ssr === 'string';
    },
    resolveId(id) {
      if (id === SNAPSHOT_VIRTUAL_ID) {
        return SNAPSHOT_RESOLVED_ID;
      }
      return undefined;
    },
    load(id) {
      if (id !== SNAPSHOT_RESOLVED_ID) {
        return undefined;
      }
      if (staticMode && isSsrBuild) {
        const raw = snapshotFile === undefined ? undefined : readFileSync(resolve(snapshotFile), 'utf8');
        const snapshot = JSON.parse(raw ?? '');
        return `export default ${JSON.stringify(snapshot)};`;
      }
      return 'export default null;';
    },
    closeBundle() {
      // 只在客户端构建收尾时拷贝部署所需的静态资源（SSR 产物会被丢弃）。
      if (!staticMode || isSsrBuild || resolved === undefined || snapshotFile === undefined) {
        return;
      }
      const outDir = resolve(resolved.root ?? '.', resolved.build.outDir);
      if (existsSync(snapshotFile)) {
        cpSync(resolve(snapshotFile), resolve(outDir, 'content', 'snapshot.json'));
      }
      // 与快照同源的已发布图片（内容哈希命名，重复拷贝幂等）。
      const uploadsDir = resolve(repoRoot, 'content/uploads');
      if (existsSync(uploadsDir)) {
        cpSync(uploadsDir, resolve(outDir, 'uploads'), { recursive: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const apiBase = env.VITE_API_BASE ?? 'http://127.0.0.1:3000/api';
  const proxy = resolveApiProxy(apiBase);
  const staticMode = env.VITE_STATIC_CONTENT === '1';
  const snapshotFile =
    staticMode && env.CONTENT_SNAPSHOT_FILE !== undefined && env.CONTENT_SNAPSHOT_FILE !== ''
      ? resolve(repoRoot, env.CONTENT_SNAPSHOT_FILE)
      : undefined;

  /**
   * 静态内容模式下，预渲染路由清单直接来自快照文件。
   *
   * 快照本来就是路由的唯一数据源（见 `prerender-routes.ts` 的纪律），这里在配置期
   * 把 slug 展开成 `PRERENDER_*` 环境变量，CI（workflow 只设 `CONTENT_SNAPSHOT_FILE`）
   * 与本地 `release.mjs` 走同一条路径——`??=` 保证 release.mjs 显式传入的清单优先。
   */
  if (snapshotFile !== undefined && existsSync(snapshotFile)) {
    const snapshot: { posts?: Array<{ slug: string }>; tags?: Array<{ slug: string }> } = JSON.parse(
      readFileSync(snapshotFile, 'utf8'),
    );
    process.env.PRERENDER_POST_SLUGS ??= (snapshot.posts ?? []).map((post) => post.slug).join(',');
    process.env.PRERENDER_TAG_SLUGS ??= (snapshot.tags ?? []).map((tag) => tag.slug).join(',');
  }

  return {
    envDir: repoRoot,
    /**
     * 静态托管子路径（GitHub Pages 项目站点形如 `/<repo>/`）。
     * 根路径部署（`<user>.github.io` 仓库或自托管）保持默认 `/`，两者都不用改代码。
     */
    base: env.VITE_SITE_BASE ?? '/',
    /**
     * 预渲染选项。只在 `vite-ssg build`（即 `pnpm release`）时生效；
     * 普通 `pnpm build` 仍然是 SPA，`ssgOptions` 被完全忽略。
     */
    ssgOptions: {
      // `nested`：`/posts/<slug>` 落成 `dist/posts/<slug>/index.html`，
      // 静态托管无需 rewrite 规则，URL 与目录一一对应（冒烟脚本也按这个布局断言）。
      dirStyle: 'nested',
    },
    // Tailwind v4 走 Vite 插件而不是 PostCSS：`styles/tokens.css` 里的 `@import 'tailwindcss'`
    // 与 `@theme` 由它在构建期展开，令牌因此只有一份来源。
    plugins: [vue(), tailwindcss(), contentSnapshotPlugin(staticMode, snapshotFile)],
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
           * 关于页才需要渲染器，这是"本地 Markdown + 共享渲染器"的设计要求。
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
