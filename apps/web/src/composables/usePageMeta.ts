/**
 * `<head>` 管理：标题、描述、OG / Twitter 卡片。
 *
 * 纪律（票 07）：meta 只能通过 `usePageMeta` 声明，**不允许**在 `onMounted` 里改 `document.title`。
 * 原因：预渲染器在 Node 里渲染时不会执行 `onMounted`，那样产出的 HTML head 就是空的，
 * 而线上水合后又变成另一套 title —— 搜索引擎与用户看到的内容会不一致。
 * `unhead` 在预渲染时会把这些声明写进 HTML，水合时复用同一份状态。
 */
import { useHead, useSeoMeta } from '@unhead/vue';
import { SITE } from '../site';

/** 一页的 meta 声明。 */
export interface PageMeta {
  /** 完整标题（已含站点名后缀）。 */
  readonly title: string;
  /** 描述；文章页取 `summary`。 */
  readonly description: string;
  /** 站点内路径，用于 `og:url` 与规范链接。 */
  readonly path?: string;
  /** OpenGraph 类型。 */
  readonly type?: 'website' | 'article';
  /** 文章首次发布时间（ISO）。 */
  readonly publishedTime?: string;
  /** 文章更新时间（ISO）。 */
  readonly modifiedTime?: string;
  /** 是否禁止收录（404 页用）。 */
  readonly noindex?: boolean;
}

/**
 * 把站点内路径补成绝对地址。
 *
 * @param path 以 `/` 开头的路径。
 * @returns 绝对 URL；未配置 `VITE_SITE_URL` 时退化为路径本身。
 */
export function absoluteUrl(path: string): string {
  const base = (import.meta.env.VITE_SITE_URL ?? '').trim().replace(/\/$/, '');
  return base === '' ? path : `${base}${path}`;
}

/**
 * 声明当前页的 head。
 *
 * @param input 返回当前页 meta 的取值函数（unhead 会跟随响应式变化）。
 */
export function usePageMeta(input: () => PageMeta): void {
  useSeoMeta({
    title: () => input().title,
    description: () => input().description,
    ogTitle: () => input().title,
    ogDescription: () => input().description,
    ogType: () => input().type ?? 'website',
    ogUrl: () => absoluteUrl(input().path ?? '/'),
    ogSiteName: SITE.name,
    ogImage: () => absoluteUrl(SITE.meta.ogImage),
    twitterCard: 'summary_large_image',
    articlePublishedTime: () => input().publishedTime,
    articleModifiedTime: () => input().modifiedTime,
  });

  // 404 之类的页面不该被收录；用空的 meta 数组表示"没有额外标签"。
  useHead(() => ({
    meta: input().noindex === true ? [{ name: 'robots', content: 'noindex' }] : [],
  }));
}

/**
 * 拼出带站点名的完整标题。
 *
 * @param page 页面标题；不传则只用站点标题。
 * @returns 如 `用 vite-ssg 给博客做预渲染 · tiny-blogs`。
 */
export function pageTitle(page?: string): string {
  return page === undefined || page === '' ? SITE.meta.title : `${page} · ${SITE.name}`;
}
