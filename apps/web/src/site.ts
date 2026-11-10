/**
 * 站点常量：品牌名、建站年份、仓库地址。
 *
 * 站点标题/描述/OG 图直接复用 `@tiny-blogs/shared` 的 `DEFAULT_SITE_META`——
 * 那份常量同时是 `ContentSnapshot.site` 的来源，因此预渲染写进 `<head>` 的文案
 * 与导出快照里的 `site` 必然一致。
 */
import { DEFAULT_SITE_META } from '@tiny-blogs/shared';

/** 站点自身的固定信息（不含任何个人信息）。 */
export const SITE = {
  /** 品牌名：站头、站脚、`<title>` 后缀共用。 */
  name: 'tiny-blogs',
  /** 建站年份（"EST. 2026"）。 */
  established: 2026,
  /** 一套页共用的品牌字体文案。 */
  wordmark: 'tiny—blogs',
  /** 首页 hero 的三行大标题（设计 01 屏），`hl` 与 `ol` 分别给第一行涂底、最后一行描边。 */
  slogan: { lead: '写代码', mid: '也写下', tail: '为什么。' },
  /** 站点元信息（标题 / 描述 / 作者 / OG 图），与 API 快照同源。 */
  meta: DEFAULT_SITE_META,
  /** 仓库地址；未配置时站脚只显示文字，不产生死链。 */
  repositoryUrl: (import.meta.env.VITE_SITE_REPO_URL ?? '').trim(),
} as const;
