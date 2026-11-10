/// <reference types="vite/client" />

/**
 * Vite 环境变量类型声明。变量清单必须与仓库根目录 `.env.example` 保持一致。
 */
interface ImportMetaEnv {
  /** dev 代理目标，生产构建时作为 API 地址（形如 http://127.0.0.1:3000/api）。 */
  readonly VITE_API_BASE?: string;
  /** 站点对外地址。 */
  readonly VITE_SITE_URL?: string;
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

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
