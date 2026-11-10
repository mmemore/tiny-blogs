<script setup lang="ts">
/**
 * 标签胶囊行：作为列表页的快速过滤入口，指向 `/tags/:slug`。
 *
 * `count` 来自公开接口，只统计已发布文章；因此不会出现"点进去空空的标签"。
 */
import type { TagWithCount } from '@tiny-blogs/shared';

defineProps<{
  /** 标签列表（按文章数降序）。 */
  readonly tags: readonly TagWithCount[];
  /** 当前选中的标签 slug（没有则高亮"全部"）。 */
  readonly active?: string;
  /** 最多展示几个，避免第一行被塞满。 */
  readonly limit?: number;
}>();
</script>

<template>
  <div class="tags">
    <RouterLink to="/posts" :class="{ on: active === undefined }">全部</RouterLink>
    <RouterLink
      v-for="tag in tags.slice(0, limit ?? 6)"
      :key="tag.slug"
      :to="`/tags/${tag.slug}`"
      :class="{ on: active === tag.slug }"
    >
      {{ tag.name }}
    </RouterLink>
  </div>
</template>
