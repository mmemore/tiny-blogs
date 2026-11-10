<script setup lang="ts">
/**
 * 兜底路由页：任何未匹配的地址都落到这里（含 `/posts/<不存在的 slug>` 以外的路径）。
 */
import NotFoundPanel from '../components/NotFoundPanel.vue';
import { pageTitle, usePageMeta } from '../composables/usePageMeta';

usePageMeta(() => ({
  title: pageTitle('页面不存在'),
  description: '这一面没有压这首歌。回到首页，或去归档翻翻别的。',
  noindex: true,
}));
</script>

<template>
  <div class="screen">
    <NotFoundPanel />
  </div>
</template>
