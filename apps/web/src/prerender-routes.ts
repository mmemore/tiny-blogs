/**
 * 预渲染路由清单。
 *
 * 纪律：**路由只来自快照**。`pnpm release` 先拉 `ContentSnapshot`，把已发布 slug 与
 * 标签 slug 写进进程环境变量（`PRERENDER_POST_SLUGS` / `PRERENDER_TAG_SLUGS`），
 * 这里的 `includedRoutes` 只在 SSR 构建里被 vite-ssg 调用，按清单展开成具体路径。
 *
 * 两条硬规则在这里结构性生效，而不是靠"记得别写进去"：
 * 1. `/admin` 前缀（登录、列表、编辑器、标签管理）**永不**参与预渲染 —— 它们是登录态页面，
 *    预渲染它们等于把后台骨架发布到公开站点；
 * 2. 带参数的路由（`:slug`、`:pathMatch(.*)*`）不允许以参数形式出现，必须展开成具体路径。
 */
import type { RouteRecordRaw } from 'vue-router';

/** 不依赖任何内容的静态公开页。 */
export const PRERENDER_STATIC_PATHS: readonly string[] = ['/', '/posts', '/tags', '/archives', '/about'];

/**
 * 从进程环境读一个逗号分隔的 slug 清单。
 *
 * @param name 环境变量名。
 * @returns 去空白、去空的 slug 数组；变量缺失时为空数组（该类路由就不生成）。
 */
function readSlugList(name: string): string[] {
  const raw = process.env[name] ?? '';
  return raw
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug !== '');
}

/**
 * 过滤出要预渲染的路径（vite-ssg 服务端入口约定导出）。
 *
 * @param _paths vite-ssg 从路由表生成的候选（含 `/admin/**` 与参数路由，全部弃用）。
 * @param _routes 路由表（未使用；保留签名以符合 vite-ssg 约定）。
 * @returns 要渲染成静态 HTML 的具体路径。
 */
export async function includedRoutes(_paths: string[], _routes: RouteRecordRaw[]): Promise<string[]> {
  if (import.meta.env.SSR !== true) {
    // 客户端构建里这段逻辑是死代码（vite-ssg 只在服务端调用）；
    // 防御性返回空数组，保证即使被误调也不会渲染后台页。
    return [];
  }

  const postPaths = readSlugList('PRERENDER_POST_SLUGS').map((slug) => `/posts/${slug}`);
  const tagPaths = readSlugList('PRERENDER_TAG_SLUGS').map((slug) => `/tags/${slug}`);
  const all = [...PRERENDER_STATIC_PATHS, ...postPaths, ...tagPaths];

  // 双保险：即便未来有人把后台路径加进静态清单，这里也拦得住。
  return all.filter((path) => !path.startsWith('/admin') && !path.includes(':'));
}
