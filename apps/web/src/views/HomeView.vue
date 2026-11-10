<script setup lang="ts">
/**
 * 首页（设计 01 屏）：hero 是最新一篇的封套 + 彩胶，下面是曲目表。
 *
 * 数据在 setup 阶段就发起（`useAsyncData`），预渲染期由 `onServerPrefetch` 等它落地，
 * 所以构建出来的 HTML 里已经有真实内容，不是空壳。
 */
import { computed } from 'vue';
import PostSleeve from '../components/PostSleeve.vue';
import StateBlock from '../components/StateBlock.vue';
import TrackSkeleton from '../components/TrackSkeleton.vue';
import TrackTable from '../components/TrackTable.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { pageTitle, usePageMeta } from '../composables/usePageMeta';
import { SITE } from '../site';
import { useContentStore } from '../stores/content';

/** 曲目表条数：与设计稿一致，一屏内既撑满版面又不压过 hero。 */
const HOME_TRACKS = 6;

const store = useContentStore();
const { data, error, pending, reload } = useAsyncData('home:tracks', () =>
  store.loadList({ page: 1, pageSize: HOME_TRACKS }),
);

/** 最新一篇（`published_seq` 最大，排序由后端保证）。 */
const latest = computed(() => data.value?.items[0] ?? null);
const items = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);

/** 还有多少张没上首页。 */
const shelfNote = computed(() => {
  const rest = Math.max(0, total.value - items.value.length);
  return rest === 0 ? '全部在架上' : `${String(rest)} 张在架上`;
});

/** `A 面 4 张 · B 面 4 张`（按当前列表统计，不写死）。 */
const sideSummary = computed(() => {
  const counts = new Map<string, number>();
  for (const post of items.value) {
    counts.set(post.track.side, (counts.get(post.track.side) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([side, count]) => `${side} 面 ${String(count)} 张`)
    .join(' · ');
});

/** 跑马灯内容：滚动的是真实曲目，不是写死的文案。 */
const tickerItems = computed(() => items.value.map((post) => `${post.track.no} ${post.title}`));

usePageMeta(() => ({
  title: pageTitle(),
  description: SITE.meta.description,
  path: '/',
}));
</script>

<template>
  <div class="screen">
    <!-- 跑马灯：真实曲目，纯装饰（aria-hidden），鼠标悬停暂停 -->
    <div v-if="tickerItems.length > 0" class="ticker" aria-hidden="true">
      <div class="tk-in">
        <span v-for="copy in 2" :key="copy" class="tk">
          <em>NOW PRESSING</em>
          <template v-for="line in tickerItems" :key="`${copy}-${line}`">
            <b>{{ line }}</b> ✳
          </template>
          <b>{{ shelfNote }}</b>
        </span>
      </div>
    </div>

    <section class="hero">
      <div class="hero-l">
        <div class="kick">
          <span class="chip-rot">SIDE A · {{ SITE.established }} · {{ total }} 张彩胶</span>
        </div>
        <h1>
          <span class="hl">{{ SITE.slogan.lead }}</span>，<br />
          {{ SITE.slogan.mid }}<br />
          <span class="ol">{{ SITE.slogan.tail }}</span>
        </h1>
        <p class="sub">{{ SITE.meta.description }}</p>
        <p class="more">
          <RouterLink class="tk-link" to="/posts">全部 {{ total }} 篇</RouterLink>
        </p>
      </div>

      <PostSleeve v-if="latest !== null" :post="latest" />
    </section>

    <div class="sec-bar">
      <h2>最近<span class="mk">刻的</span></h2>
      <span class="sp">{{ sideSummary }}</span>
    </div>

    <TrackSkeleton v-if="pending && items.length === 0" :rows="HOME_TRACKS" />

    <StateBlock v-else-if="error !== null" title="曲目表没读出来" :description="error.message">
      <button type="button" class="tk-link" @click="reload">重试</button>
    </StateBlock>

    <StateBlock
      v-else-if="items.length === 0"
      title="还没有压好的曲目"
      description="第一张彩胶还在母带上。登录后台写一篇，发布后这里就会出现。"
      cta-label="开始写作"
      :cta-to="{ path: '/admin' }"
    />

    <TrackTable v-else :items="items" />

    <div v-if="items.length > 0" class="shelf-foot">
      <RouterLink class="tk-link" to="/posts">{{ shelfNote }}</RouterLink>
    </div>

    <div class="bigmark" aria-hidden="true">{{ SITE.wordmark }}</div>
  </div>
</template>
