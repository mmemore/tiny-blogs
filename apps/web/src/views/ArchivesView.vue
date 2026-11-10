<script setup lang="ts">
/**
 * 归档（设计 06 屏）：把「年 → 月」的分组呈现成一本出版年鉴。
 *
 * 数据来自 `GET /api/archives`：年份倒序、月份倒序、组内按发布序号降序（契约 §3），
 * 前端不重排、不重算计数。
 *
 * 注意契约：归档里的每一项是 `PostRef`（slug / title / track），**不含**日期与标签。
 * 所以这里第二列放 `CAT.` 目录号而不是设计稿里的「月.日」——月已经在分组标题上，
 * 硬造一个日期就等于前端自己算派生值（违反 §3 的单一来源原则）。
 */
import { computed } from 'vue';
import StateBlock from '../components/StateBlock.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { pageTitle, usePageMeta } from '../composables/usePageMeta';
import { useScrollSpy } from '../composables/useScrollSpy';
import { accentColor } from '../lib/format';
import { useContentStore } from '../stores/content';

const store = useContentStore();
const { data, error, pending, reload } = useAsyncData('page:archive', () => store.loadArchive());

const years = computed(() => data.value ?? []);

/** 全部已发布文章数（各年 count 之和，与站头的 N PRESSINGS 同源）。 */
const total = computed(() => years.value.reduce((sum, year) => sum + year.count, 0));

/** 最新一年（用作标题旁的年份标注）。 */
const latestYear = computed(() => (years.value[0] === undefined ? '' : String(years.value[0].year)));

/** 年份锚点 id：既用于左侧年鉴栏的跳转，也用于滚动跟随。 */
const yearIds = computed(() => years.value.map((year) => `arc-${String(year.year)}`));

const activeYearId = useScrollSpy(() => yearIds.value);

/**
 * 月份标注的行数。
 *
 * @param count 文章数。
 * @returns 如 `3 TRACKS`；单个用 `1 TRACK`。
 */
function trackCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'TRACK' : 'TRACKS'}`;
}

usePageMeta(() => ({
  title: pageTitle('出版年鉴'),
  description: '按年月归档的全部已发布曲目，倒序排列。',
  path: '/archives',
}));
</script>

<template>
  <div class="screen">
    <div class="list-head">
      <h1>出版<span class="mk">年鉴</span></h1>
      <span class="n">
        CATALOG<template v-if="latestYear !== ''"> · {{ latestYear }}</template> · {{ total }} PRESSINGS
      </span>
    </div>

    <StateBlock v-if="error !== null" title="年鉴没读出来" :description="error.message">
      <button type="button" class="tk-link" @click="reload">重试</button>
    </StateBlock>

    <StateBlock
      v-else-if="years.length === 0 && !pending"
      title="年鉴还是空的"
      description="发布第一篇文章后，这里会按年月自动排版。"
      cta-label="看全部曲目"
      :cta-to="{ path: '/posts' }"
    />

    <div v-else-if="years.length > 0" class="arc">
      <aside class="arc-yr" aria-label="年份">
        <a
          v-for="year in years"
          :key="year.year"
          :href="`#arc-${year.year}`"
          :class="{ on: activeYearId === `arc-${year.year}` }"
        >
          <b>{{ year.year }}</b>
          <span>{{ year.count }} 张</span>
        </a>
      </aside>

      <div class="arc-body">
        <section v-for="year in years" :id="`arc-${year.year}`" :key="year.year">
          <template v-for="month in year.months" :key="`${year.year}-${month.month}`">
            <h3 class="arc-mon">{{ month.month }}月 <span>{{ trackCount(month.posts.length) }}</span></h3>
            <RouterLink
              v-for="post in month.posts"
              :key="post.slug"
              class="arc-row"
              :to="`/posts/${post.slug}`"
            >
              <span class="no" :style="{ color: accentColor(post.track.accent) }">{{ post.track.no }}</span>
              <span class="d">{{ post.track.catalog }}</span>
              <span class="t">{{ post.title }}</span>
            </RouterLink>
          </template>
        </section>
      </div>
    </div>

    <div class="bigmark" aria-hidden="true">catalog</div>
  </div>
</template>
