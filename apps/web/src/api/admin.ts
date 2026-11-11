/**
 * 后台写侧接口（契约 §5「管理」）。所有路径都在 `JwtAuthGuard` 之后。
 *
 * 与 `api/content.ts` 分开的理由：那一份是**公开读侧**，可以在预渲染（Node）里跑；
 * 这一份只有登录后才能用，必须留在浏览器里，也绝不能被预渲染流程引用到。
 */
import {
  DEFAULT_ADMIN_PAGE_SIZE,
  type AdminPostDetail,
  type AdminPostListItem,
  type Page,
  type PostInput,
  type PostRecord,
  type PostStatus,
  type TagRef,
  type UploadResult,
} from '@tiny-blogs/shared';
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from './client';

/** 后台列表查询条件。 */
export interface AdminPostQuery {
  /** 只看某个状态；不传表示全部。 */
  readonly status?: PostStatus;
  /** 搜标题或 slug。 */
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * 拉一页文章（含草稿）。
 *
 * @param query 过滤与分页。
 * @returns 分页结果，按更新时间倒序。
 */
export function listAdminPosts(query: AdminPostQuery = {}): Promise<Page<AdminPostListItem>> {
  return apiGet<Page<AdminPostListItem>>('/admin/posts', {
    status: query.status,
    q: query.q,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? DEFAULT_ADMIN_PAGE_SIZE,
  });
}

/**
 * 拉编辑视图（含 Markdown 原文）。
 *
 * @param slug 文章 slug。
 * @returns 详情。
 */
export function getAdminPost(slug: string): Promise<AdminPostDetail> {
  return apiGet<AdminPostDetail>(`/admin/posts/${encodeURIComponent(slug)}`);
}

/**
 * 新建文章（一律以草稿落库）。
 *
 * @param input 文章字段。
 * @returns 新建的记录。
 */
export function createAdminPost(input: PostInput): Promise<PostRecord> {
  return apiPost<PostRecord>('/admin/posts', input);
}

/**
 * 更新文章（乐观锁）。
 *
 * @param slug 当前 slug。
 * @param input 文章字段 + `expectedUpdatedAt`。
 * @returns 更新后的记录。
 * @throws {ApiRequestError} 409 `STALE_WRITE`（另一处已改）/ 409 `SLUG_TAKEN`。
 */
export function updateAdminPost(
  slug: string,
  input: PostInput & { readonly expectedUpdatedAt: string },
): Promise<PostRecord> {
  return apiPut<PostRecord>(`/admin/posts/${encodeURIComponent(slug)}`, input);
}

/**
 * 发布（幂等）。
 *
 * @param slug 文章 slug。
 * @returns 发布后的记录。
 */
export function publishAdminPost(slug: string): Promise<PostRecord> {
  return apiPost<PostRecord>(`/admin/posts/${encodeURIComponent(slug)}/publish`);
}

/**
 * 取消发布（保留发布序号）。
 *
 * @param slug 文章 slug。
 * @returns 取消发布后的记录。
 */
export function unpublishAdminPost(slug: string): Promise<PostRecord> {
  return apiPost<PostRecord>(`/admin/posts/${encodeURIComponent(slug)}/unpublish`);
}

/**
 * 硬删一篇文章。
 *
 * @param slug 文章 slug。
 */
export function deleteAdminPost(slug: string): Promise<void> {
  return apiDelete<void>(`/admin/posts/${encodeURIComponent(slug)}`);
}

/**
 * 上传一张图片。
 *
 * @param file 浏览器 `File` 对象。
 * @returns 存储键与站内 URL。
 * @throws {ApiRequestError} 422 `FILE_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE`。
 */
export function uploadImage(file: File): Promise<UploadResult> {
  return apiUpload<UploadResult>('/admin/upload', file);
}

/**
 * 拉全部标签（含未被使用的），用于编辑器的补全下拉。
 *
 * @returns 标签列表。
 */
export function listAdminTags(): Promise<readonly TagRef[]> {
  return apiGet<readonly TagRef[]>('/admin/tags');
}

/**
 * 新建标签。
 *
 * @param input 名称与 slug。
 * @returns 新标签。
 */
export function createAdminTag(input: TagRef): Promise<TagRef> {
  return apiPost<TagRef>('/admin/tags', input);
}

/**
 * 改名或改 slug。
 *
 * @param slug 当前 slug。
 * @param input 新名称与新 slug。
 * @returns 更新后的标签。
 */
export function updateAdminTag(slug: string, input: TagRef): Promise<TagRef> {
  return apiPut<TagRef>(`/admin/tags/${encodeURIComponent(slug)}`, input);
}

/**
 * 删除标签（只解除与文章的关联）。
 *
 * @param slug 标签 slug。
 */
export function deleteAdminTag(slug: string): Promise<void> {
  return apiDelete<void>(`/admin/tags/${encodeURIComponent(slug)}`);
}
