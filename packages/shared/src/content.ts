import type { PostStatus } from './post-status';

/**
 * 文章 slug 的形状（契约 §2：`^[a-z0-9]+(-[a-z0-9]+)*$`，varchar 140）。
 * DTO 校验、写侧查重、前台路由都共用这一条规则。
 */
export const POST_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * 标签 slug 的形状。契约只规定"后台手填"，v1 复用文章 slug 的形状，
 * 保证 `/tags/:slug` 这类 URL 稳定可读。
 */
export const TAG_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 标签的对外最小表示。 */
export interface TagRef {
  readonly name: string;
  readonly slug: string;
}

/**
 * 文章记录（数据库行的领域投影，不含任何派生值）。
 *
 * `tags` 是可选字段：仓储层按需 join 后填入；投影函数会把它当作空数组处理。
 */
export interface PostRecord {
  readonly id: number;
  readonly authorId: number;
  readonly title: string;
  readonly slug: string;
  readonly summary: string;
  readonly contentMd: string;
  readonly status: PostStatus;
  readonly publishedSeq: number | null;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
  readonly tags?: readonly TagRef[];
}

/**
 * 写侧入参（新建与更新共用）。
 * 作者身份**不在这里**：它来自登录态（`Principal`）。
 */
export interface PostInput {
  readonly title: string;
  readonly slug: string;
  readonly summary: string;
  readonly contentMd: string;
  /** 标签 slug 列表；未知 slug 会被拒绝（422），空数组表示清空标签。 */
  readonly tagSlugs: readonly string[];
}

/** 后台列表行：含草稿与 `publishedSeq`（契约 §5「管理」）。 */
export interface AdminPostListItem {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly status: PostStatus;
  readonly authorId: number;
  readonly publishedSeq: number | null;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
  readonly tags: readonly TagRef[];
}

/** 后台编辑用的完整记录（含 Markdown 原文）。 */
export interface AdminPostDetail extends AdminPostListItem {
  readonly contentMd: string;
}

/** 标签写侧入参（新建与改名共用）。 */
export interface TagInput {
  readonly name: string;
  readonly slug: string;
}

/** 分页信封（契约 §5）。 */
export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
