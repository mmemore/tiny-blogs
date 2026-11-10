<script setup lang="ts">
/**
 * 关于（设计 04 屏的「内页说明」）。
 *
 * 正文来自仓库内的 `content/about.md`（见 `content/about.ts`），不走接口、不占表。
 * 文案纪律：只写站点自身的技术背景与写作原则，不出现真实姓名、公司、求职意向与私人联系方式——
 * 设计稿里的"林一 / 前端工程师 / 在职看机会"是虚构占位，这里没有照抄。
 */
import { computed } from 'vue';
import RecordCrate from '../components/RecordCrate.vue';
import { ABOUT_HTML } from '../content/about';
import { useAsyncData } from '../composables/useAsyncData';
import { pageTitle, usePageMeta } from '../composables/usePageMeta';
import { SITE } from '../site';
import { useContentStore } from '../stores/content';

const store = useContentStore();

// 与站头共用同一个缓存键：站头已经取过总数时，这里直接命中，不会多发一次请求。
const { data: total } = useAsyncData('site:published-total', () => store.loadPublishedTotal());

/** `SINCE` 那一行：建站年月 + 当前篇数。 */
const sinceLine = computed(() => {
  const count = total.value === null ? '若干' : String(total.value);
  return `${SITE.established} 年开始写，目前 ${count} 篇，还在继续。`;
});

usePageMeta(() => ({
  title: pageTitle('关于'),
  description: '关于这个站：技术选型、写作原则与版式说明。',
  path: '/about',
}));
</script>

<template>
  <div class="screen">
    <div class="about">
      <div class="about-l">
        <div class="kick">
          <span class="chip-rot">LINER NOTES · 内页</span>
        </div>
        <h1>{{ SITE.wordmark }}</h1>
        <p class="sub">Vue 3 · NestJS · MySQL 8 · Prerendered</p>

        <!-- 正文来自本地 Markdown（shared 的 renderMarkdown 渲染），不含任何个人信息 -->
        <div class="bd" v-html="ABOUT_HTML" />

        <dl class="credits">
          <div>
            <dt>STACK</dt>
            <dd>Vue 3 · TypeScript · Vite · Pinia · Tailwind CSS · NestJS · TypeORM · MySQL 8 · pnpm</dd>
          </div>
          <div>
            <dt>PRESSING</dt>
            <dd>构建期预渲染成静态 HTML，发布只需一条命令；读者的首屏不依赖脚本执行。</dd>
          </div>
          <div>
            <dt>SINCE</dt>
            <dd>{{ sinceLine }}</dd>
          </div>
        </dl>

        <div class="contact">
          <RouterLink to="/posts">全部曲目</RouterLink>
          <RouterLink to="/tags">按标签翻箱</RouterLink>
          <RouterLink to="/archives">出版年鉴</RouterLink>
          <span class="st">33⅓ RPM</span>
        </div>
      </div>

      <figure class="about-p about-r">
        <div class="sleeve">
          <div class="ph">
            <RecordCrate />
          </div>
          <div class="cap2">
            <b class="hand">唱片箱</b>
            <span>HOME CRATE · {{ SITE.established }}</span>
          </div>
        </div>
      </figure>
    </div>

    <div class="bigmark" aria-hidden="true">liner notes</div>
  </div>
</template>
