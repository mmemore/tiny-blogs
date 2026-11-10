/**
 * 公开读侧接口（契约 §5「公开」）。这里是前端唯一允许拼 API 路径的地方。
 *
 * 列表的 `q` 走服务端 ngram 全文检索；`pageSize` 上限 24 由后端 422 兜底，
 * 前端只按常量传值，不做二次裁剪（避免"前端悄悄改需求"）。
 */
import {
  DEFAULT_PAGE_SIZE,
  type ArchiveYear,
  type Page,
  type PostDetail,
  type PostSummary,
  type TagWithCount,
} from '@tiny-blogs/shared';
import { apiGet } from './client';

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
 * 拉一页已发布文章。
 *
 * @param params 查询条件（`page` 默认 1，`pageSize` 默认 8）。
 * @returns 分页结果，排序恒为 `published_at DESC, published_seq DESC`。
 */
export function listPosts(params: ListPostsParams = {}): Promise<Page<PostSummary>> {
  return apiGet<Page<PostSummary>>('/posts', {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
    tag: params.tag,
    q: params.q,
    year: params.year,
    month: params.month,
  });
}

/**
 * 拉一篇已发布文章。
 *
 * @param slug 文章 slug。
 * @returns 详情（草稿与不存在的 slug 都会抛 404）。
 */
export function getPost(slug: string): Promise<PostDetail> {
  return apiGet<PostDetail>(`/posts/${encodeURIComponent(slug)}`);
}

/**
 * 拉标签及其已发布文章数。
 *
 * @returns 标签列表，按文章数降序。
 */
export function listTags(): Promise<TagWithCount[]> {
  return apiGet<TagWithCount[]>('/tags');
}

/**
 * 拉年月归档。
 *
 * @returns 年份倒序、月份倒序的归档树。
 */
export function getArchive(): Promise<ArchiveYear[]> {
  return apiGet<ArchiveYear[]>('/archives');
}
