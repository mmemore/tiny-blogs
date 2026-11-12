/// <reference types="vite/client" />

/**
 * Vite 环境变量类型声明。变量清单必须与仓库根目录 `.env.example` 保持一致。
 */
interface ImportMetaEnv {
  /** dev 代理目标，生产构建时作为 API 地址（形如 http://127.0.0.1:3000/api）。 */
  readonly VITE_API_BASE?: string;
  /** 站点对外地址。 */
  readonly VITE_SITE_URL?: string;
  /** 静态托管子路径（GitHub Pages 项目站点形如 `/repo/`）；默认 `/`。 */
  readonly VITE_SITE_BASE?: string;
  /**
   * 静态内容模式开关（`1` 启用）。只应在发布构建（`pnpm release` 与 CI）里设置：
   * 启用后取数走内置快照查询而非 HTTP（见 `api/snapshot-source.ts`）。
   */
  readonly VITE_STATIC_CONTENT?: string;
  /** 仓库地址；留空则站脚的仓库链接只显示为文字（不产生死链）。 */
  readonly VITE_SITE_REPO_URL?: string;
  readonly VITE_GISCUS_REPO?: string;
  readonly VITE_GISCUS_REPO_ID?: string;
  readonly VITE_GISCUS_CATEGORY?: string;
  readonly VITE_GISCUS_CATEGORY_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * 快照虚拟模块（由 `vite.config.ts` 的 `contentSnapshotPlugin` 提供）。
 * - SSR 构建且静态模式：内联完整 `ContentSnapshot`；
 * - 其它构建：`null`（运行时按需 fetch 站点上的快照文件）。
 */
declare module 'virtual:content-snapshot' {
  import type { ContentSnapshot } from '@tiny-blogs/shared';

  const embeddedSnapshot: ContentSnapshot | null;
  export default embeddedSnapshot;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
