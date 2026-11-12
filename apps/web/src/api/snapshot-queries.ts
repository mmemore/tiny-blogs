/**
 * 在 ContentSnapshot 上本地求值的公开读侧查询。
 *
 * 与 `ContentService`（API 侧）实现同一契约，区别只在数据来源与检索方式：
 * - 快照已经按 `published_at DESC, published_seq DESC` 排好序（导出时保证），
 *   分页即数组切片；
 * - `prev` / `next` / `html` / `headings` 导出时已算好，直接透传；
 * - 全文检索退化为"标题 + 摘要 + 原文的大小写不敏感子串匹配"——MySQL 的
 *   ngram 全文索引在静态托管上不可用。对个人博客的文章量，两种方式给出的
 *   结果集几乎一致；这是静态模式的明确取舍，不是等价实现。
 */
import {
  MAX_PAGE_SIZE,
  type ArchiveYear,
  type ListQuery,
  type Page,
  type PostDetail,
  type PostSummary,
  type TagWithCount,
} from '@tiny-blogs/shared';
import { ApiRequestError } from './client';
import { loadSnapshot } from './snapshot-source';

/** 快照里的一篇文章（`PostDetail` + 原文，与 `ContentSnapshot.posts` 一致）。 */
type SnapshotPost = PostDetail & { readonly contentMd: string };

/**
 * 快照文章 → 列表项（剥掉构建期专用字段：html / headings / prev / next / contentMd）。
 *
 * @param post 快照文章。
 * @returns 列表项。
 */
function toSummary(post: SnapshotPost): PostSummary {
  return {
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    readingMinutes: post.readingMinutes,
    track: post.track,
    tags: post.tags,
  };
}

/**
 * 按契约语义截断/钳制分页参数（与 `ContentService.listPublished` 一致）。
 *
 * @param page 页码。
 * @param pageSize 每页条数。
 * @returns 钳制后的值。
 */
function clampPaging(page: number, pageSize: number): { page: number; pageSize: number } {
  return {
    page: Math.max(1, Math.trunc(page)),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(pageSize))),
  };
}

/**
 * 全文检索（子串匹配，大小写不敏感）。
 *
 * @param post 快照文章。
 * @param keyword 关键词。
 * @returns 是否命中。
 */
function matchesKeyword(post: SnapshotPost, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  return (
    post.title.toLowerCase().includes(needle) ||
    post.summary.toLowerCase().includes(needle) ||
    post.contentMd.toLowerCase().includes(needle)
  );
}

/**
 * 文章列表（契约 §5 `GET /api/posts` 的静态实现）。
 *
 * @param query 查询条件（page / pageSize / tag / q / year / month）。
 * @returns 分页结果。
 */
export async function snapshotListPosts(query: ListQuery): Promise<Page<PostSummary>> {
  const snapshot = await loadSnapshot();
  const { page, pageSize } = clampPaging(query.page, query.pageSize);

  const filtered = snapshot.posts.filter((post) => {
    if (query.tag !== undefined && query.tag !== '' && !post.tags.some((tag) => tag.slug === query.tag)) {
      return false;
    }
    if (query.q !== undefined && query.q.trim() !== '' && !matchesKeyword(post, query.q.trim())) {
      return false;
    }
    if (query.year !== undefined) {
      // publishedAt 是 ISO UTC 字符串；前 4 位即年份，第 6-7 位即月份。
      const at = post.publishedAt ?? '';
      if (at.slice(0, 4) !== String(query.year)) {
        return false;
      }
      if (query.month !== undefined && at.slice(5, 7) !== String(query.month).padStart(2, '0')) {
        return false;
      }
    } else if (query.month !== undefined) {
      const at = post.publishedAt ?? '';
      if (at.slice(5, 7) !== String(query.month).padStart(2, '0')) {
        return false;
      }
    }
    return true;
  });

  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize).map(toSummary),
    page,
    pageSize,
    total: filtered.length,
  };
}

/**
 * 文章详情（契约 §5 `GET /api/posts/:slug` 的静态实现）。
 *
 * @param slug 文章 slug。
 * @returns 详情。
 * @throws {ApiRequestError} slug 不存在时 404（与 API 的错误信封一致，页面分支逻辑不变）。
 */
export async function snapshotGetPost(slug: string): Promise<PostDetail> {
  const snapshot = await loadSnapshot();
  const found = snapshot.posts.find((post) => post.slug === slug);
  if (found === undefined) {
    throw new ApiRequestError(404, 'NOT_FOUND', '文章不存在');
  }
  return found;
}

/**
 * 标签总览（契约 §5 `GET /api/tags` 的静态实现）。
 *
 * @returns 按文章数降序、名称升序的标签列表（导出时已排序）。
 */
export async function snapshotListTags(): Promise<TagWithCount[]> {
  const snapshot = await loadSnapshot();
  // 快照字段是 readonly；调用方（store）持有可变数组类型，浅拷贝一层即可。
  return [...snapshot.tags];
}

/**
 * 年月归档（契约 §5 `GET /api/archives` 的静态实现）。
 *
 * @returns 归档树（导出时已分组排序）。
 */
export async function snapshotGetArchive(): Promise<ArchiveYear[]> {
  const snapshot = await loadSnapshot();
  return [...snapshot.archive];
}
