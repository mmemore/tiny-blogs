/**
 * 读侧模块的接口（契约 §4.2 `ContentQuery`）。
 *
 * 单独定义接口而不是直接用 service 类型，是为了让"不变量在模块内部"这件事可被审查：
 * 调用方（控制器、构建导出）只能看到这五个方法，没有任何地方能传 `status` 进去。
 */
import type {
  ArchiveYear,
  ContentSnapshot,
  ListQuery,
  Page,
  PostDetail,
  PostSummary,
  TagWithCount,
} from '@tiny-blogs/shared';

/** 公开读侧：一切方法只返回 `status = 'published'`。 */
export interface ContentQuery {
  /**
   * 已发布文章列表。
   *
   * @param query 分页与过滤条件。
   * @returns 分页结果，排序恒为 `published_at DESC, published_seq DESC`。
   */
  listPublished(query: ListQuery): Promise<Page<PostSummary>>;

  /**
   * 已发布文章详情（含上下篇）。
   *
   * @param slug 文章 slug。
   * @returns 详情；草稿与不存在的 slug 都返回 `null`（HTTP 层统一 404，不泄漏存在性）。
   */
  findPublished(slug: string): Promise<PostDetail | null>;

  /**
   * 标签 + 已发布文章数。
   *
   * @returns 只含至少有一篇已发布文章的标签，按文章数降序、名称升序。
   */
  listTags(): Promise<TagWithCount[]>;

  /**
   * 年月归档。
   *
   * @returns 年份倒序、月份倒序，组内按发布序号降序。
   */
  getArchive(): Promise<ArchiveYear[]>;

  /**
   * 构建/备份用快照。与公开查询共用同一套投影函数，因此字段绝不漂移。
   *
   * @returns 全量快照（文章含 `contentMd`）。
   */
  exportSnapshot(): Promise<ContentSnapshot>;
}
