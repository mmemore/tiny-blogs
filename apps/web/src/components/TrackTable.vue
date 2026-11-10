<script setup lang="ts">
/**
 * 曲目表：首页与列表页共用的一张"曲目"阵列。
 *
 * `track.no` 的颜色由后端给的 `accent` 决定（四色彩胶轮换），时长直接用 `readingMinutes`。
 */
import type { PostSummary } from '@tiny-blogs/shared';
import { accentColor, formatDuration, formatMonthDay, joinTagNames } from '../lib/format';

defineProps<{
  /** 一批已发布文章（顺序即展示顺序）。 */
  readonly items: readonly PostSummary[];
}>();
</script>

<template>
  <ol class="tracks">
    <li v-for="post in items" :key="post.slug">
      <RouterLink :to="`/posts/${post.slug}`">
        <span class="no" :style="{ color: accentColor(post.track.accent) }">{{ post.track.no }}</span>
        <span class="ttl">{{ post.title }}</span>
        <span class="tg">{{ joinTagNames(post.tags) }}</span>
        <span class="dt">{{ formatMonthDay(post.publishedAt) }}</span>
        <span class="du">{{ formatDuration(post.readingMinutes) }}</span>
      </RouterLink>
    </li>
  </ol>
</template>
