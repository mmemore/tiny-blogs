<script setup lang="ts">
/**
 * 分页：页码 + 每页/总数标注。
 *
 * 页码链接保留当前路由与 `q`，只改 `page`；第 1 页不带 `page` 参数，保证首页 URL 干净。
 */
import { computed } from 'vue';
import { useRoute, type RouteLocationRaw } from 'vue-router';

const props = defineProps<{
  /** 当前页（1 起）。 */
  readonly page: number;
  /** 每页条数。 */
  readonly pageSize: number;
  /** 总条数。 */
  readonly total: number;
}>();

const route = useRoute();

/** 总页数（至少 1）。 */
const lastPage = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

/** 页码窗口：当前页两侧各两页，最多 5 个。 */
const visiblePages = computed(() => {
  const start = Math.max(1, Math.min(props.page - 2, lastPage.value - 4));
  const end = Math.min(lastPage.value, start + 4);
  const pages: number[] = [];
  for (let value = start; value <= end; value += 1) {
    pages.push(value);
  }
  return pages;
});

/**
 * 生成某一页的链接（保留标签路由与搜索词）。
 *
 * @param page 目标页。
 * @returns 可直接给 `RouterLink` 的地址。
 */
function toPage(page: number): RouteLocationRaw {
  return {
    name: route.name ?? 'posts',
    params: route.params,
    query: { ...route.query, page: page === 1 ? undefined : String(page) },
  };
}
</script>

<template>
  <nav v-if="total > pageSize" class="pager" aria-label="分页">
    <RouterLink v-if="page > 1" :to="toPage(page - 1)" :aria-label="`第 ${page - 1} 页`">←</RouterLink>

    <RouterLink
      v-for="value in visiblePages"
      :key="value"
      :to="toPage(value)"
      :class="{ on: value === page }"
      :aria-current="value === page ? 'page' : undefined"
    >
      {{ String(value).padStart(2, '0') }}
    </RouterLink>

    <RouterLink v-if="page < lastPage" :to="toPage(page + 1)" :aria-label="`第 ${page + 1} 页`">→</RouterLink>

    <span class="sp">每页 {{ pageSize }} 张 · 共 {{ total }} 张</span>
  </nav>
</template>
