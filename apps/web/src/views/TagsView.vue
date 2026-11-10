<script setup lang="ts">
/**
 * 标签总览（设计 05 屏的隔板墙）：按文章数降序的分类隔板。
 *
 * 计数来自 `GET /api/tags`（只统计已发布），所以不会点进一个空标签。
 * 点击进入 `/tags/:slug`，那里复用列表页的曲目表。
 */
import { computed } from 'vue';
import StateBlock from '../components/StateBlock.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { pageTitle, usePageMeta } from '../composables/usePageMeta';
import { useContentStore } from '../stores/content';

const store = useContentStore();
const { data, error, pending, reload } = useAsyncData('page:tags', () => store.loadTags());

/** 后端已按文章数降序排好，这里不再排序（避免"前端悄悄改契约"）。 */
const tags = computed(() => data.value ?? []);

usePageMeta(() => ({
  title: pageTitle('标签'),
  description: '按标签翻箱：每个标签下的已发布曲目数量与曲目表。',
  path: '/tags',
}));
</script>

<template>
  <div class="screen">
    <div class="list-head">
      <h1>按标签<span class="mk">翻箱</span></h1>
      <span class="n">CRATE DIVIDERS · {{ tags.length }} 类</span>
    </div>

    <div v-if="tags.length > 0" class="tagwall">
      <RouterLink
        v-for="tag in tags"
        :key="tag.slug"
        class="dcard"
        :to="`/tags/${tag.slug}`"
        :aria-label="`${tag.name}：${tag.count} 篇`"
      >
        <b>{{ tag.name }}</b>
        <span>{{ tag.count }} 张彩胶</span>
      </RouterLink>
    </div>

    <StateBlock v-else-if="error !== null" title="隔板没读出来" :description="error.message">
      <button type="button" class="tk-link" @click="reload">重试</button>
    </StateBlock>

    <StateBlock
      v-else-if="!pending"
      title="还没有贴标签"
      description="标签在后台写文章时勾选；有标签后这里会自动出现分类隔板。"
      cta-label="看全部曲目"
      :cta-to="{ path: '/posts' }"
    />

    <div class="tag-foot">
      <RouterLink class="tk-link" to="/posts">看全部曲目</RouterLink>
    </div>

    <div class="bigmark" aria-hidden="true">genres</div>
  </div>
</template>
