/**
 * 内容缓存（Pinia）。
 *
 * 为什么是 store 而不是组件内部 ref：预渲染时页面要能被序列化进 HTML 的 payload，
 * 水合时同一份数据要能被复用（而不是再发一次请求）。因此**数据只落在 store 里**，
 * `useAsyncData` 只管加载生命周期。
 *
 * 键的构成：列表键由全部查询参数拼成，所以「同一组参数」永远命中同一份缓存。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ArchiveYear, Page, PostDetail, PostSummary, TagWithCount } from '@tiny-blogs/shared';
import { getArchive, getPost, listPosts, listTags, type ListPostsParams } from '../api/content';

/**
 * 把查询参数拼成稳定的缓存键。
 *
 * @param params 列表查询参数。
 * @returns 形如 `page=1&pageSize=8&q=预渲染` 的键（顺序固定、空值省略）。
 */
export function toListKey(params: ListPostsParams): string {
  const entries: Array<[string, string]> = [
    ['page', String(params.page ?? 1)],
    ['pageSize', String(params.pageSize ?? 8)],
  ];
  if (params.tag !== undefined && params.tag !== '') {
    entries.push(['tag', params.tag]);
  }
  if (params.q !== undefined && params.q !== '') {
    entries.push(['q', params.q]);
  }
  if (params.year !== undefined) {
    entries.push(['year', String(params.year)]);
  }
  if (params.month !== undefined) {
    entries.push(['month', String(params.month)]);
  }
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
}

export const useContentStore = defineStore('content', () => {
  /** 列表缓存：键见 `toListKey`。 */
  const lists = ref<Record<string, Page<PostSummary>>>({});

  /** 详情缓存：slug → 详情。 */
  const details = ref<Record<string, PostDetail>>({});

  /** 标签总览（含已发布文章数）。 */
  const tags = ref<TagWithCount[] | null>(null);

  /** 年月归档。 */
  const archive = ref<ArchiveYear[] | null>(null);

  /** 站头用：已发布文章总数（`null` 表示还没取到）。 */
  const publishedTotal = ref<number | null>(null);

  /**
   * 读一页列表（命中缓存则不再请求）。
   *
   * @param params 查询参数。
   * @returns 分页结果。
   */
  async function loadList(params: ListPostsParams): Promise<Page<PostSummary>> {
    const key = toListKey(params);
    const cached = lists.value[key];
    if (cached !== undefined) {
      return cached;
    }
    const page = await listPosts(params);
    lists.value[key] = page;
    return page;
  }

  /**
   * 读一篇文章详情（命中缓存则不再请求）。
   *
   * @param slug 文章 slug。
   * @returns 详情。
   */
  async function loadDetail(slug: string): Promise<PostDetail> {
    const cached = details.value[slug];
    if (cached !== undefined) {
      return cached;
    }
    const detail = await getPost(slug);
    details.value[slug] = detail;
    return detail;
  }

  /**
   * 读标签总览（命中缓存则不再请求）。
   *
   * @returns 标签列表。
   */
  async function loadTags(): Promise<TagWithCount[]> {
    if (tags.value !== null) {
      return tags.value;
    }
    const list = await listTags();
    tags.value = list;
    return list;
  }

  /**
   * 读归档（命中缓存则不再请求）。
   *
   * @returns 归档树。
   */
  async function loadArchive(): Promise<ArchiveYear[]> {
    if (archive.value !== null) {
      return archive.value;
    }
    const value = await getArchive();
    archive.value = value;
    return value;
  }

  /**
   * 取站头需要的已发布总数。
   *
   * 只发一次 `pageSize=1` 的请求：`total` 就是全部已发布文章数，
   * 比额外开一个统计接口便宜，也不用在别的模块里重复算。
   *
   * @returns 已发布文章数。
   */
  async function loadPublishedTotal(): Promise<number> {
    if (publishedTotal.value !== null) {
      return publishedTotal.value;
    }
    const page = await listPosts({ pageSize: 1 });
    publishedTotal.value = page.total;
    return page.total;
  }

  /**
   * 清空全部公开缓存。
   *
   * 后台的写操作（发布 / 取消发布 / 删除）会改变公开侧的结果，
   * 但公开缓存是按参数键存在这个 store 里的，后台无从知道哪些键失效。
   * 与其猜，不如整体作废：读者下一次进入页面时重新取一份，
   * 而"刚改完就回前台看"正是最需要看到新状态的时刻。
   */
  function invalidate(): void {
    lists.value = {};
    details.value = {};
    tags.value = null;
    archive.value = null;
    publishedTotal.value = null;
  }

  return {
    lists,
    details,
    tags,
    archive,
    publishedTotal,
    invalidate,
    loadList,
    loadDetail,
    loadTags,
    loadArchive,
    loadPublishedTotal,
  };
});
