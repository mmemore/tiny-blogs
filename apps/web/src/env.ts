/**
 * 浏览器侧配置。
 *
 * 纪律（secrets 纪律）：只有 `VITE_` 前缀的变量会进浏览器产物，视同公开，
 * 因此这里只允许放站点信息与公开的第三方配置，任何 secret 都不许出现。
 */
export interface GiscusConfig {
  readonly repo: string;
  readonly repoId: string;
  readonly category: string;
  readonly categoryId: string;
}

export interface WebEnv {
  /** 站点对外地址，用于 OG/规范链接（预渲染期即需要）。 */
  readonly siteUrl: string;
  /** 评论占位配置；四项任一为空则不渲染（v1 默认不渲染）。 */
  readonly giscus: GiscusConfig;
}

/**
 * 读取并补齐前端配置。
 *
 * @param source Vite 注入的环境变量表。
 * @returns 强类型配置；缺省值保证 v1 在没有任何额外配置时也能跑起来。
 */
export function readWebEnv(source: ImportMetaEnv = import.meta.env): WebEnv {
  return {
    siteUrl: source.VITE_SITE_URL ?? 'http://localhost:5173',
    giscus: {
      repo: source.VITE_GISCUS_REPO ?? '',
      repoId: source.VITE_GISCUS_REPO_ID ?? '',
      category: source.VITE_GISCUS_CATEGORY ?? '',
      categoryId: source.VITE_GISCUS_CATEGORY_ID ?? '',
    },
  };
}

/** 全应用共用的前端配置实例。 */
export const webEnv: WebEnv = readWebEnv();

/**
 * 评论位是否可用。
 *
 * 约定是"配置项为空则整块不渲染"——不是渲染一个空容器再隐藏。
 * 因此这个判断要在**模板层**用（`v-if`），而不是挂载后再 `display: none`：
 * 后者会让预渲染产物里留下一个空壳，读者看到一条多余的横线。
 *
 * @param config 评论配置。
 * @returns 四项都非空才返回 true。
 */
export function isGiscusConfigured(config: GiscusConfig): boolean {
  return (
    config.repo.trim() !== '' &&
    config.repoId.trim() !== '' &&
    config.category.trim() !== '' &&
    config.categoryId.trim() !== ''
  );
}
