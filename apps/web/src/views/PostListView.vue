<script setup lang="ts">
/**
 * 文章列表（设计 02 屏），同时也是标签筛选页（`/tags/:slug`）——同一套曲目表，
 * 只是标题与"是否按标签过滤"不同（设计上要求复用同一组件）。
 *
 * 搜索与分页都写在 URL 上（`?q=` / `?page=`），因此刷新、分享、前进后退都能还原现场；
 * 关键词走服务端 ngram 检索，前端不做任何本地过滤。
 */
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DEFAULT_PAGE_SIZE } from '@tiny-blogs/shared';
import PagerNav from '../components/PagerNav.vue';
import SearchField from '../components/SearchField.vue';
import StateBlock from '../components/StateBlock.vue';
import TagPills from '../components/TagPills.vue';
import TrackSkeleton from '../components/TrackSkeleton.vue';
import TrackTable from '../components/TrackTable.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { pageTitle, usePageMeta } from '../composables/usePageMeta';
import { useContentStore } from '../stores/content';
import { formatYear } from '../lib/format';

/** 每页条数：契约默认值 8（上限 24 由服务端把关）。 */
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

const route = useRoute();
const router = useRouter();
const store = useContentStore();

/** 当前关键词（来自 `?q=`）。 */
const keyword = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''));

/** 当前页（非法值一律回落到 1，不把脏 URL 传给后端）。 */
const currentPage = computed(() => {
  const raw = Number(route.query.page ?? 1);
  return Number.isInteger(raw) && raw >= 1 ? raw : 1;
});

/** 当前标签 slug（`/tags/:slug` 上有值）。 */
const tagSlug = computed(() => {
  const value = route.params.slug;
  return typeof value === 'string' && value !== '' ? value : undefined;
});

/** 请求参数（对象身份变化即触发重新加载）。 */
const params = computed(() => ({
  page: currentPage.value,
  pageSize: PAGE_SIZE,
  q: keyword.value === '' ? undefined : keyword.value,
  tag: tagSlug.value,
}));

const { data, error, pending, reload } = useAsyncData('page:posts', () => store.loadList(params.value));
const { data: allTags } = useAsyncData('page:tags', () => store.loadTags());

// URL 变化（搜索、翻页、切换标签）后重新取数；store 命中缓存时立即返回。
watch(params, () => {
  void reload();
});

/** 当前标签对象（拿中文名与计数）。 */
const activeTag = computed(() =>
  tagSlug.value === undefined ? null : ((allTags.value ?? []).find((tag) => tag.slug === tagSlug.value) ?? null),
);

const items = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);

/** 列表右上角的年份标注：取最新一篇的年份。 */
const latestYear = computed(() => formatYear(items.value[0]?.publishedAt ?? null));

/** 标签页标题用标签名，列表页用"全部曲目"。 */
const headingText = computed(() => (tagSlug.value === undefined ? '全部' : (activeTag.value?.name ?? tagSlug.value)));

usePageMeta(() => ({
  title: pageTitle(tagSlug.value === undefined ? '全部曲目' : `标签：${headingText.value}`),
  description:
    tagSlug.value === undefined
      ? '全部已发布曲目，按发布时间倒序。'
      : `${headingText.value} 标签下的全部曲目。`,
  path: tagSlug.value === undefined ? '/posts' : `/tags/${tagSlug.value}`,
}));

/**
 * 搜索词变化：写回 URL（同时把页码归 1）。
 *
 * @param value 新关键词（已去空格）。
 */
function onSearch(value: string): void {
  void router.replace({
    query: { ...route.query, q: value === '' ? undefined : value, page: undefined },
  });
}
</script>

<template>
  <div class="screen">
    <div v-if="tagSlug !== undefined" class="crumb">
      <RouterLink class="back" to="/tags">← 全部标签</RouterLink>
    </div>

    <div class="list-head">
      <h1>{{ headingText }}<span class="mk">曲目</span></h1>
      <span class="n">
        {{ total }} PRESSINGS<template v-if="tagSlug !== undefined"> · TAG {{ tagSlug }}</template
        ><template v-else-if="latestYear !== ''"> · {{ latestYear }}</template>
      </span>
    </div>

    <div class="tools">
      <SearchField :model-value="keyword" @update:model-value="onSearch" />
      <TagPills :tags="allTags ?? []" :active="tagSlug" />
    </div>

    <TrackSkeleton v-if="pending && items.length === 0" :rows="PAGE_SIZE" />

    <StateBlock v-else-if="error !== null" title="曲目表没读出来" :description="error.message">
      <button type="button" class="tk-link" @click="reload">重试</button>
    </StateBlock>

    <StateBlock
      v-else-if="items.length === 0 && keyword !== ''"
      title="没搜到这张唱片"
      :description="`没有标题、摘要或正文包含「${keyword}」的已发布文章。换个词试试，或清空搜索看全部曲目。`"
    >
      <button type="button" class="tk-link" @click="onSearch('')">清空搜索</button>
    </StateBlock>

    <StateBlock
      v-else-if="items.length === 0"
      title="这一箱还是空的"
      :description="tagSlug === undefined ? '还没有发布的文章。' : '这个标签下还没有已发布的文章。'"
      cta-label="看全部曲目"
      :cta-to="{ path: '/posts' }"
    />

    <template v-else>
      <TrackTable :items="items" />
      <PagerNav :page="currentPage" :page-size="PAGE_SIZE" :total="total" />
    </template>
  </div>
</template>
