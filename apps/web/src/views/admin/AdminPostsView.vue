<script setup lang="ts">
/**
 * 文章管理列表（设计稿 09 屏）。
 *
 * 数据纪律：
 * - 后台页面**不用** `useAsyncData`（那是给预渲染用的），直接在 `onMounted` 里取，
 *   因为后台页面永远不会被预渲染，也没有"首屏 HTML 里带数据"的需求；
 * - 写操作（发布 / 取消发布 / 删除）之后**同时**做两件事：重新拉后台列表、
 *   作废公开侧缓存（`content.invalidate()`）。只做前者会出现"后台已发布、点预览还是旧页面"。
 */
import {
  NButton,
  NInput,
  NPagination,
  NSpin,
  useDialog,
  useMessage,
} from 'naive-ui';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  DEFAULT_ADMIN_PAGE_SIZE,
  POST_STATUS,
  toTrack,
  type AdminPostListItem,
  type Page,
  type PostStatus,
} from '@tiny-blogs/shared';
import {
  deleteAdminPost,
  listAdminPosts,
  publishAdminPost,
  unpublishAdminPost,
} from '../../api/admin';
import { ApiRequestError } from '../../api/client';
import { formatDate, formatTime, joinTagNames } from '../../lib/format';
import { useContentStore } from '../../stores/content';

/** 状态筛选：空串表示"全部"。 */
type StatusFilter = '' | PostStatus;

/** 一条列表行的展示模型（把派生值算好，模板里不再做判断）。 */
interface Row {
  readonly item: AdminPostListItem;
  /** 曲目号（草稿没有发布序号，显示 `—`）。 */
  readonly trackNo: string;
  readonly updatedLabel: string;
  readonly isPublished: boolean;
}

const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const content = useContentStore();

/** 查询条件。`status` 用空串而不是 `undefined`，方便绑定到按钮组。 */
const query = reactive<{ status: StatusFilter; q: string; page: number }>({
  status: '',
  q: '',
  page: 1,
});

/** 当前页数据。 */
const page = ref<Page<AdminPostListItem> | null>(null);

/** 三个页签的计数（`全部 / 已发布 / 草稿`）。 */
const totals = ref<{ all: number; published: number; draft: number }>({ all: 0, published: 0, draft: 0 });

/** 列表加载中。 */
const loading = ref(false);

/** 正在被写操作锁定的 slug（防连点，也用来显示行内 loading）。 */
const busySlug = ref<string | null>(null);

/** 页签定义。 */
const TABS: readonly { key: StatusFilter; label: string }[] = [
  { key: '', label: '全部' },
  { key: POST_STATUS.published, label: '已发布' },
  { key: POST_STATUS.draft, label: '草稿' },
];

/** 表格行。 */
const rows = computed<Row[]>(() =>
  (page.value?.items ?? []).map((item) => ({
    item,
    trackNo: deriveTrackNo(item.publishedSeq),
    updatedLabel: `${formatDate(item.updatedAt)} ${formatTime(item.updatedAt)}`,
    isPublished: item.status === POST_STATUS.published,
  })),
);

/** 总页数（至少 1，避免分页器在空列表上显示 "0 / 0"）。 */
const pageCount = computed(() => {
  const total = page.value?.total ?? 0;
  return Math.max(1, Math.ceil(total / DEFAULT_ADMIN_PAGE_SIZE));
});

/**
 * 由发布序号派生曲目号。
 *
 * 复用共享包的 `toTrack()`（与前台曲目表同一套规则），而不是自己算 `A1`：
 * 两处一旦各写一份，就会出现"列表说 A7、文章页说 B3"。
 *
 * @param seq 发布序号（草稿为 `null`）。
 * @returns 形如 `A1`；草稿返回 `—`。
 */
function deriveTrackNo(seq: number | null): string {
  if (seq === null) {
    return '—';
  }
  try {
    return toTrack(seq).no;
  } catch {
    // 超出曲目号容量（104 篇）时不让整个列表炸掉，如实显示占位符。
    return '?';
  }
}

/**
 * 拉当前页。
 *
 * @returns 完成即返回。
 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    page.value = await listAdminPosts({
      status: query.status === '' ? undefined : query.status,
      q: query.q.trim(),
      page: query.page,
    });
  } catch (error) {
    message.error(describe(error, '列表加载失败'));
  } finally {
    loading.value = false;
  }
}

/**
 * 拉三个页签的计数。
 *
 * 用三次 `pageSize=1` 的轻请求换准确的数字：比在列表接口里塞三个 total 更省改动，
 * 也比"用当前页条数糊弄"诚实。
 *
 * @returns 完成即返回。
 */
async function loadTotals(): Promise<void> {
  try {
    const [all, published, draft] = await Promise.all([
      listAdminPosts({ pageSize: 1 }),
      listAdminPosts({ pageSize: 1, status: POST_STATUS.published }),
      listAdminPosts({ pageSize: 1, status: POST_STATUS.draft }),
    ]);
    totals.value = { all: all.total, published: published.total, draft: draft.total };
  } catch {
    // 计数只是辅助信息，失败不该挡住列表。
  }
}

/**
 * 把异常翻译成一句人话。
 *
 * @param error 捕获到的异常。
 * @param fallback 兜底文案。
 * @returns 展示用文案。
 */
function describe(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/** 切页签：回到第一页再拉。 */
async function switchTab(key: StatusFilter): Promise<void> {
  if (query.status === key) {
    return;
  }
  query.status = key;
  query.page = 1;
  await load();
}

/** 搜索（回车或清空时触发）。 */
async function search(): Promise<void> {
  query.page = 1;
  await load();
}

/** 翻页。 */
async function changePage(next: number): Promise<void> {
  query.page = next;
  await load();
}

/**
 * 写操作之后的统一收尾：重拉列表与计数，并作废公开缓存。
 *
 * @returns 完成即返回。
 */
async function afterWrite(): Promise<void> {
  content.invalidate();
  await Promise.all([load(), loadTotals()]);
}

/**
 * 发布 / 取消发布。
 *
 * @param row 目标行。
 * @returns 完成即返回。
 */
async function togglePublish(row: Row): Promise<void> {
  if (busySlug.value !== null) {
    return;
  }
  busySlug.value = row.item.slug;
  try {
    if (row.isPublished) {
      await unpublishAdminPost(row.item.slug);
      message.success(`《${row.item.title}》已转为草稿`);
    } else {
      await publishAdminPost(row.item.slug);
      message.success(`《${row.item.title}》已发布，需重建后对外可见`);
    }
    await afterWrite();
  } catch (error) {
    message.error(describe(error, '操作失败'));
  } finally {
    busySlug.value = null;
  }
}

/**
 * 删除（二次确认，硬删）。
 *
 * @param row 目标行。
 */
function confirmDelete(row: Row): void {
  dialog.warning({
    title: '删除文章',
    content: `《${row.item.title}》将被永久删除，无法恢复。确定继续？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      busySlug.value = row.item.slug;
      try {
        await deleteAdminPost(row.item.slug);
        message.success('已删除');
        await afterWrite();
      } catch (error) {
        message.error(describe(error, '删除失败'));
      } finally {
        busySlug.value = null;
      }
    },
  });
}

/** 打开编辑器。 */
function edit(slug: string): void {
  void router.push({ name: 'admin-post-edit', params: { slug } });
}

/** 新建。 */
function create(): void {
  void router.push({ name: 'admin-post-new' });
}

/** 预览公开页面（仅已发布）。 */
function preview(slug: string): void {
  window.open(`/posts/${encodeURIComponent(slug)}`, '_blank', 'noopener');
}

onMounted(async () => {
  await Promise.all([load(), loadTotals()]);
});
</script>

<template>
  <div class="adm-posts">
    <div class="bar">
      <NInput
        v-model:value="query.q"
        placeholder="搜索标题或 slug"
        clearable
        class="search"
        @keydown.enter="search"
        @clear="search"
      />
      <NButton @click="search">搜索</NButton>
      <span class="sp" />
      <NButton type="primary" @click="create">＋ 新建文章</NButton>
    </div>

    <div class="n-tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="query.status === tab.key"
        :class="{ on: query.status === tab.key }"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
        {{ tab.key === '' ? totals.all : tab.key === POST_STATUS.published ? totals.published : totals.draft }}
      </button>
    </div>

    <NSpin :show="loading">
      <div class="n-card">
        <table class="n-table">
          <thead>
            <tr>
              <th class="c-title">标题</th>
              <th class="c-track">曲目</th>
              <th class="c-status">状态</th>
              <th class="c-tags">标签</th>
              <th class="c-time">更新时间</th>
              <th class="c-act">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.item.slug">
              <td class="tt">
                {{ row.item.title }}
                <div class="sl">/posts/{{ row.item.slug }}</div>
              </td>
              <td class="track">{{ row.trackNo }}</td>
              <td>
                <span v-if="row.isPublished" class="chip pub">已发布</span>
                <span v-else class="chip draft">DRAFT</span>
              </td>
              <td class="tags">{{ joinTagNames(row.item.tags) || '—' }}</td>
              <td class="dtm">{{ row.updatedLabel }}</td>
              <td class="act">
                <button type="button" :disabled="busySlug === row.item.slug" @click="edit(row.item.slug)">
                  编辑
                </button>
                <button
                  v-if="row.isPublished"
                  type="button"
                  :disabled="busySlug === row.item.slug"
                  @click="preview(row.item.slug)"
                >
                  预览
                </button>
                <button
                  type="button"
                  :disabled="busySlug === row.item.slug"
                  @click="togglePublish(row)"
                >
                  {{ row.isPublished ? '取消发布' : '发布' }}
                </button>
                <button
                  type="button"
                  class="del"
                  :disabled="busySlug === row.item.slug"
                  @click="confirmDelete(row)"
                >
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="rows.length === 0 && !loading">
              <td colspan="6" class="empty">
                {{ query.q.trim() === '' ? '还没有文章，点右上角新建一篇。' : '没有匹配的文章。' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </NSpin>

    <div class="n-page">
      <NPagination
        :page="query.page"
        :page-count="pageCount"
        :page-slot="7"
        @update:page="changePage"
      />
      <span class="sp">共 {{ page?.total ?? 0 }} 条</span>
    </div>

    <p class="adm-note">发布后需要重建一次才对外可见，约一分钟。构建失败时线上保留上一版。</p>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search {
  width: 230px;
  --n-height: 34px;
}

.bar .sp,
.n-page .sp {
  margin-left: auto;
}

.n-tabs {
  display: flex;
  gap: 24px;
  margin-top: 20px;
  border-bottom: 1px solid var(--color-line);
  font-size: 13px;
}

.n-tabs button {
  padding: 0 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--color-faint);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s;
}

.n-tabs button:hover {
  color: var(--color-dim);
}

.n-tabs button.on {
  color: var(--color-ink);
  border-bottom-color: var(--color-accent);
}

.n-card {
  margin-top: 16px;
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: 6px;
  overflow-x: auto;
}

.n-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: 13px;
}

.n-table th {
  padding: 11px 16px;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-bg);
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.n-table td {
  padding: 13px 16px;
  border-bottom: 1px solid var(--color-line);
  color: var(--color-body);
  vertical-align: middle;
}

.n-table tbody tr:last-child td {
  border-bottom: 0;
}

.n-table tbody tr:hover td {
  background: var(--color-bg);
}

.c-title {
  width: 44%;
}

.c-track {
  width: 62px;
}

.c-time {
  width: 132px;
}

.c-act {
  text-align: right;
}

.tt {
  color: var(--color-ink);
  font-weight: 500;
}

.sl {
  margin-top: 4px;
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.track {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--color-dim);
  white-space: nowrap;
}

.dtm {
  color: var(--color-dim);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
}

.tags {
  color: var(--color-dim);
  font-size: 12px;
}

/* 状态：已发布用实心墨色胶囊，草稿用虚线印章（转一点角度，像盖上去的） */
.chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
}

.chip.pub {
  background: var(--color-ink);
  color: var(--color-bg);
}

.chip.draft {
  padding: 0 7px;
  border: 1.5px dashed var(--color-line2);
  color: var(--color-dim);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  transform: rotate(-3deg);
}

.act {
  text-align: right;
  white-space: nowrap;
}

.act button {
  margin-left: 12px;
  border: 0;
  background: none;
  color: var(--color-dim);
  font-size: 12.5px;
  cursor: pointer;
}

.act button:hover {
  color: var(--color-accent-dark);
}

.act button.del:hover {
  color: var(--color-accent-dark);
  text-decoration: underline;
}

.act button:disabled {
  color: var(--color-faint);
  cursor: not-allowed;
}

.empty {
  padding: 34px 16px;
  color: var(--color-faint);
  font-size: 12.5px;
  text-align: center;
}

.n-page {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 11px;
}

.adm-note {
  margin-top: 12px;
  color: var(--color-faint);
  font-size: 11.5px;
}
</style>
