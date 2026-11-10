/**
 * 文章状态：与数据库 `posts.status` 的 enum 取值一一对应（契约 §2）。
 */
export const POST_STATUS = {
  draft: 'draft',
  published: 'published',
} as const;

/** 文章状态联合类型。 */
export type PostStatus = (typeof POST_STATUS)[keyof typeof POST_STATUS];

/** 全部文章状态，供枚举校验与后台筛选复用。 */
export const POST_STATUSES: readonly PostStatus[] = [POST_STATUS.draft, POST_STATUS.published];

/**
 * 判断任意值是否为合法的文章状态。
 *
 * @param value 待判断的值。
 * @returns 命中 `draft` / `published` 时为 true。
 */
export function isPostStatus(value: unknown): value is PostStatus {
  return value === POST_STATUS.draft || value === POST_STATUS.published;
}
