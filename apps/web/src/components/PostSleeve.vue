<script setup lang="ts">
/**
 * 首页 hero 右侧的"最新一张"：封套 + 彩胶。
 *
 * 数据全部来自后端（`track` / `readingMinutes` 直接用），前端不重算任何派生值。
 */
import type { PostSummary } from '@tiny-blogs/shared';
import { SITE } from '../site';
import { formatDate, formatMinutesLabel, trackCaption } from '../lib/format';
import VinylDisc from './VinylDisc.vue';

defineProps<{
  /** 最新一篇（`published_seq` 最大）。 */
  readonly post: PostSummary;
}>();
</script>

<template>
  <div class="pair">
    <RouterLink class="sleeve f-sleeve" :to="`/posts/${post.slug}`">
      <div class="stamp">NEW<small>PRESSING</small></div>
      <div class="sk">
        CAT. {{ post.track.catalog }} · SIDE {{ post.track.side }} · {{ trackCaption(post.track) }}
      </div>
      <div class="srule" />
      <h3>{{ post.title }}</h3>
      <p class="tagline">{{ post.summary }}</p>
      <div class="bt">
        <span>{{ formatDate(post.publishedAt) }}</span>
        <span class="sp">{{ formatMinutesLabel(post.readingMinutes) }}</span>
      </div>
    </RouterLink>

    <div class="disc-slot" :aria-label="`${SITE.name} 最新彩胶`" role="img">
      <VinylDisc :catalog="post.track.catalog" :side="`SIDE ${post.track.side}`" :accent="post.track.accent" />
    </div>
  </div>
</template>
