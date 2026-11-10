<script setup lang="ts">
/**
 * 站头：品牌 + `EST. 年份 · N PRESSINGS` + 导航（当前态压一条奶油黄）。
 *
 * N 来自公开接口的 `total`（一次 `pageSize=1` 的请求），不另开统计接口。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAsyncData } from '../composables/useAsyncData';
import { useContentStore } from '../stores/content';
import { SITE } from '../site';

interface NavItem {
  readonly label: string;
  /** 用路径而不是路由名：导航是静态清单，不该被路由表的重构牵连。 */
  readonly to: string;
  readonly match: (path: string) => boolean;
}

const route = useRoute();
const store = useContentStore();
const { data: total } = useAsyncData('site:published-total', () => store.loadPublishedTotal());

const pressings = computed(() => (total.value === null ? '—' : String(total.value)));

/** 导航项；`match` 决定当前态（文章包含首页与文章详情）。 */
const NAV: readonly NavItem[] = [
  { label: '文章', to: '/posts', match: (path) => path === '/' || path.startsWith('/posts') },
  { label: '标签', to: '/tags', match: (path) => path.startsWith('/tags') },
  { label: '归档', to: '/archives', match: (path) => path.startsWith('/archives') },
  { label: '关于', to: '/about', match: (path) => path.startsWith('/about') },
];

/**
 * 判断导航项是否为当前页。
 *
 * @param item 导航项。
 * @returns 命中返回 true。
 */
function isActive(item: NavItem): boolean {
  return item.match(route.path);
}
</script>

<template>
  <header class="top">
    <RouterLink class="brand" :to="{ name: 'home' }">
      <i aria-hidden="true" />
      {{ SITE.name }}
    </RouterLink>
    <span class="cat">EST. {{ SITE.established }} · {{ pressings }} PRESSINGS</span>

    <nav class="nv" aria-label="主导航">
      <RouterLink v-for="item in NAV" :key="item.label" :to="item.to" :class="{ on: isActive(item) }">
        {{ item.label }}
      </RouterLink>
      <RouterLink class="dim" to="/admin">后台</RouterLink>
    </nav>
  </header>
</template>
