<script setup lang="ts">
/**
 * 404 正文（设计 07 屏）。
 *
 * 单独抽成组件，是因为它有两个入口：
 * 1. 兜底路由（`/:pathMatch(.*)*`）；
 * 2. 文章详情报 404（未知 slug / 已取消发布的文章）—— 接口 404 必须变成页面 404，不能白屏。
 */
import GhostSleeve from './GhostSleeve.vue';

withDefaults(
  defineProps<{
    /** 说明文字；文章页可以换成"这篇可能已取消发布"。 */
    readonly description?: string;
  }>(),
  { description: '这一面没有压这首歌。可能曲号排错了，可能它还躺在母带上没刻进来。' },
);
</script>

<template>
  <section class="nf">
    <div>
      <div class="kick">
        <span class="chip-rot">TRACK NOT FOUND · 面号不存在</span>
      </div>
      <div class="nf-big">4<span class="ol">0</span>4</div>
      <p class="nf-sub">{{ description }}</p>
      <div class="nf-act">
        <RouterLink class="tk-link" to="/">回到 A 面</RouterLink>
        <span class="nf-alt">或去 <RouterLink to="/archives">归档</RouterLink> 翻翻别的</span>
      </div>
    </div>

    <GhostSleeve />
  </section>

  <div class="bigmark" aria-hidden="true">out of press</div>
</template>
