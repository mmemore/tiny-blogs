/**
 * 公开读侧接口（契约 §5「公开」）。这里是前端唯一允许拼 API 路径的地方。
 *
 * 取数分流的唯一分岔点：静态内容模式（`VITE_STATIC_CONTENT=1`，发布构建启用）走
 * 快照本地求值（`snapshot-queries.ts`），否则走 HTTP（`apiGet`）。两条路对上层
 * 暴露同一组函数签名与同一套错误（404 同为 `NOT_FOUND` 信封语义），页面无感知。
 *
 * 列表的 `q` 在 API 模式走服务端 ngram 全文检索；静态模式退化为子串匹配
 * （见 `snapshot-queries.ts` 的说明）。`pageSize` 上限 24 由后端 422 兜底，
 * 前端只按常量传值，不做二次裁剪（避免"前端悄悄改需求"）。
 */
import {
  DEFAULT_PAGE_SIZE,
  type ArchiveYear,
  type ListQuery,
  type Page,
  type PostDetail,
  type PostSummary,
  type TagWithCount,
} from '@tiny-blogs/shared';
import { apiGet } from './client';
import { staticMode } from './snapshot-source';
import {
  snapshotGetArchive,
  snapshotGetPost,
  snapshotListPosts,
  snapshotListTags,
} from './snapshot-queries';

/** 列表查询条件。 */
export interface ListPostsParams {
  readonly page?: number;
  readonly pageSize?: number;
  /** 标签 slug。 */
  readonly tag?: string;
  /** 全文检索关键词。 */
  readonly q?: string;
  readonly year?: number;
  readonly month?: number;
}

/**
 * 把前端的查询参数收敛成契约的 `ListQuery`（两条取数路径共用同一形状）。
 *
 * @param params 前端查询参数。
 * @returns 契约查询对象。
 */
function toListQuery(params: ListPostsParams): ListQuery {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
    tag: params.tag,
    q: params.q,
    year: params.year,
    month: params.month,
  };
}

/**
 * 拉一页已发布文章。
 *
 * @param params 查询条件（`page` 默认 1，`pageSize` 默认 8）。
 * @returns 分页结果，排序恒为 `published_at DESC, published_seq DESC`。
 */
export function listPosts(params: ListPostsParams = {}): Promise<Page<PostSummary>> {
  if (staticMode) {
    return snapshotListPosts(toListQuery(params));
  }
  const query = toListQuery(params);
  return apiGet<Page<PostSummary>>('/posts', {
    page: query.page,
    pageSize: query.pageSize,
    tag: query.tag,
    q: query.q,
    year: query.year,
    month: query.month,
  });
}

/**
 * 拉一篇已发布文章。
 *
 * @param slug 文章 slug。
 * @returns 详情（草稿与不存在的 slug 都会抛 404）。
 */
export function getPost(slug: string): Promise<PostDetail> {
  if (staticMode) {
    return snapshotGetPost(slug);
  }
  return apiGet<PostDetail>(`/posts/${encodeURIComponent(slug)}`);
}

/**
 * 拉标签及其已发布文章数。
 *
 * @returns 标签列表，按文章数降序。
 */
export function listTags(): Promise<TagWithCount[]> {
  if (staticMode) {
    return snapshotListTags();
  }
  return apiGet<TagWithCount[]>('/tags');
}

/**
 * 拉年月归档。
 *
 * @returns 年份倒序、月份倒序的归档树。
 */
export function getArchive(): Promise<ArchiveYear[]> {
  if (staticMode) {
    return snapshotGetArchive();
  }
  return apiGet<ArchiveYear[]>('/archives');
}
