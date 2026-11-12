/**
 * 静态内容模式的数据源（发布链路的 Pages 形态，ADR-0004）。
 *
 * 静态托管上没有 API 进程，取数分两条路，由构建期（虚拟模块）就决定好：
 * - SSR 预渲染构建：快照 JSON 已内联进 bundle（`virtual:content-snapshot`）；
 * - 客户端运行时：按需 fetch 站点上的 `content/snapshot.json`（构建时拷进产物），
 *   一个会话只拉一次，之后翻页 / 搜索 / 标签筛选全部在快照上本地求值。
 *
 * 非静态模式（`pnpm dev` 与 API 模式构建）不会进入本模块——`api/content.ts`
 * 只在 `VITE_STATIC_CONTENT=1` 时才调用这里。
 */
import type { ContentSnapshot } from '@tiny-blogs/shared';
import embeddedSnapshot from 'virtual:content-snapshot';

/** 静态内容模式是否启用（由发布构建的环境变量决定，dev 恒为 false）。 */
export const staticMode = import.meta.env.VITE_STATIC_CONTENT === '1';

/** 快照缓存：一个运行环境只加载一份。 */
let cached: Promise<ContentSnapshot> | null = null;

/**
 * 读取内容快照。
 *
 * @returns 快照对象。
 * @throws {Error} 静态模式未启用，或快照文件缺失 / 形状不合法。
 */
export function loadSnapshot(): Promise<ContentSnapshot> {
  cached ??= (async () => {
    const raw =
      embeddedSnapshot ??
      (await fetch(`${import.meta.env.BASE_URL}content/snapshot.json`).then((response) => {
        if (!response.ok) {
          throw new Error(`内容快照加载失败（HTTP ${String(response.status)}）`);
        }
        return response.json() as Promise<unknown>;
      }));

    if (
      typeof raw !== 'object' ||
      raw === null ||
      (raw as ContentSnapshot).version !== 1 ||
      !Array.isArray((raw as ContentSnapshot).posts)
    ) {
      throw new Error('内容快照形状不合法');
    }
    return withBase(raw as ContentSnapshot);
  })();
  return cached;
}

/**
 * 把快照里的站点根路径资源改写成带部署子路径的形式。
 *
 * Markdown 渲染出的 `<img src="/uploads/…">` 是绝对路径（API 模式下由同源反代服务），
 * 在项目站点（`/<repo>/` 子路径）上会指向错误位置；这里统一补上 `BASE_URL`。
 * 根路径部署（base = `/`）原样返回，不做任何替换。
 *
 * @param snapshot 原始快照。
 * @returns 资源路径已对齐部署子路径的快照。
 */
function withBase(snapshot: ContentSnapshot): ContentSnapshot {
  const base = import.meta.env.BASE_URL;
  if (base === '' || base === '/') {
    return snapshot;
  }
  // 渲染器输出双引号属性；这里按"img 标签的 src 以 /uploads/ 开头"精确匹配，
  // 不做全文盲替换，避免误伤正文里的代码块或链接。
  const imgSrcPattern = /(<img\b[^>]*?\bsrc=)(["'])\/uploads\//g;
  const rewrite = (html: string): string => html.replace(imgSrcPattern, `$1$2${base}uploads/`);
  return {
    ...snapshot,
    posts: snapshot.posts.map((post) => ({ ...post, html: rewrite(post.html) })),
  };
}
