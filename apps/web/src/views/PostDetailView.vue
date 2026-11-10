<script setup lang="ts">
/**
 * 文章详情（设计 03 屏）：折页封套 + 正文 + 目录 + 上下篇。
 *
 * 预渲染纪律（票 10 的前提）：
 * - 数据在 setup 阶段发起，`onServerPrefetch` 等它落地，产物 HTML 里就有正文；
 * - meta 全部走 `usePageMeta`，绝不在 `onMounted` 里改 `document.title`；
 * - 正文只消费接口给好的 `html`，**浏览器端不引 markdown-it**（渲染在服务端完成）。
 *
 * 404 纪律：未知 slug / 已取消发布的文章，接口返回 404，这里必须变成页面 404，
 * 而不是白屏或"加载失败，请重试"。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { PostDetail } from '@tiny-blogs/shared';
import { ApiRequestError } from '../api/client';
import GiscusComments from '../components/GiscusComments.vue';
import NotFoundPanel from '../components/NotFoundPanel.vue';
import StateBlock from '../components/StateBlock.vue';
import TocList from '../components/TocList.vue';
import VinylDisc from '../components/VinylDisc.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { pageTitle, usePageMeta } from '../composables/usePageMeta';
import { useScrollSpy } from '../composables/useScrollSpy';
import { accentLabel, formatDate, formatMinutesLabel } from '../lib/format';
import { SITE } from '../site';
import { useContentStore } from '../stores/content';

const route = useRoute();
const store = useContentStore();

/** 当前 slug（路由参数永远存在，这里只做类型收窄）。 */
const slug = computed(() => {
  const value = route.params.slug;
  return typeof value === 'string' ? value : '';
});

// 详情页没有"骨架屏"：正文到位前先显示一个状态块，`pending` 因此不必暴露给模板。
const { data, error, reload } = useAsyncData<PostDetail>('post:detail', () =>
  store.loadDetail(slug.value),
);

// 上下篇跳转 / 直接改 slug 时组件会被复用，必须按新 slug 重新取数（命中 store 缓存则立即返回）。
watch(slug, () => {
  void reload();
});

const post = computed(() => data.value);

/** 接口是否明确告诉我们"这篇不存在"（区别于网络错误、5xx）。 */
const notFound = computed(() => error.value instanceof ApiRequestError && error.value.status === 404);

/** 目录项（h2/h3，id 由 shared 的渲染器分配为 `t1`、`t2`…）。 */
const headings = computed(() => post.value?.headings ?? []);

/** 只有两节以上才值得出目录，否则右侧栏比正文还空。 */
const hasToc = computed(() => headings.value.length > 1);

/** 滚动跟随：取"最后一个越过阈值线的标题"。 */
const activeId = useScrollSpy(() => headings.value.map((heading) => heading.id));

/** 更新时间与发布时间不同日时才显示"更新于"，避免每次保存都多一行噪音。 */
const updatedNote = computed(() => {
  const current = post.value;
  if (current === null || current.publishedAt === null) {
    return '';
  }
  const published = formatDate(current.publishedAt);
  const updated = formatDate(current.updatedAt);
  return published === updated ? '' : `更新于 ${updated}`;
});

/** 封套上的标签行（设计稿用 ` / ` 分隔）。 */
const tagLine = computed(() => (post.value?.tags ?? []).map((tag) => tag.name).join(' / '));

usePageMeta(() => {
  const current = post.value;

  if (current === null) {
    // 还没取到（或 404）：标题先退回站点名，404 页额外标 noindex。
    return {
      title: notFound.value ? pageTitle('页面不存在') : pageTitle(),
      description: notFound.value ? '这篇文章可能已经取消发布，或者链接输错了。' : SITE.meta.description,
      path: route.path,
      noindex: notFound.value,
    };
  }

  return {
    title: pageTitle(current.title),
    description: current.summary,
    path: `/posts/${current.slug}`,
    type: 'article',
    publishedTime: current.publishedAt ?? undefined,
    modifiedTime: current.updatedAt,
  };
});

/** 正文容器（用于给代码块补"复制"按钮）。 */
const proseEl = ref<HTMLElement | null>(null);

/**
 * 给每个代码块补一个复制按钮。
 *
 * 只在浏览器里做，且只改 DOM、不改 `html` 字符串：按钮不存在于预渲染产物中，
 * 因此不会造成水合不一致（水合比对的是服务端 HTML 与客户端首次渲染结果）。
 *
 * @param root 正文容器。
 */
function enhanceCodeBlocks(root: HTMLElement): void {
  for (const pre of root.querySelectorAll<HTMLPreElement>('pre')) {
    if (pre.querySelector('.copy-code') !== null) {
      continue;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code';
    button.textContent = 'COPY';
    button.setAttribute('aria-label', '复制这段代码');

    button.addEventListener('click', () => {
      const code = pre.querySelector('code');
      void copyText(code?.textContent ?? '', button);
    });

    pre.append(button);
  }
}

/**
 * 复制文本并给出短暂反馈。
 *
 * @param text 要复制的文本。
 * @param button 触发复制的按钮。
 */
async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'COPIED';
  } catch {
    // 非安全上下文（http）或用户拒绝授权：如实告知，不要假装成功。
    button.textContent = 'FAILED';
  }
  window.setTimeout(() => {
    button.textContent = 'COPY';
  }, 1400);
}

onMounted(() => {
  if (proseEl.value !== null) {
    enhanceCodeBlocks(proseEl.value);
  }
});

// 客户端换页（上一篇/下一篇）后正文会被整体替换，按钮要重新补上。
watch(
  () => post.value?.html,
  () => {
    void nextTick(() => {
      if (proseEl.value !== null) {
        enhanceCodeBlocks(proseEl.value);
      }
    });
  },
  { flush: 'post' },
);
</script>

<template>
  <div class="screen">
    <!-- 404：接口明确说不存在，就走真正的 404 页，而不是"取数失败" -->
    <template v-if="notFound">
      <NotFoundPanel description="这篇可能已经取消发布，或者链接里的曲目号排错了。" />
    </template>

    <template v-else-if="post === null">
      <div class="post-top">
        <RouterLink class="back" to="/posts">← 全部曲目</RouterLink>
      </div>
      <StateBlock v-if="error !== null" title="这张唱片取不出来" :description="error.message">
        <button type="button" class="tk-link" @click="reload">重试</button>
      </StateBlock>
      <StateBlock v-else title="正在取出这张唱片" description="马上就好。" />
    </template>

    <template v-else>
      <div class="post-top">
        <RouterLink class="back" to="/posts">← 全部曲目</RouterLink>

        <div class="gate">
          <div class="gate-face">
            <div class="sk">
              CAT. {{ post.track.catalog }} · SIDE {{ post.track.side }} · TRACK {{ post.track.no }} ·
              {{ accentLabel(post.track.accent) }}
            </div>
            <h1>{{ post.title }}</h1>
            <div class="gate-m">
              <span>{{ formatDate(post.publishedAt) }}</span>
              <span>{{ formatMinutesLabel(post.readingMinutes) }}</span>
              <span v-if="updatedNote !== ''">{{ updatedNote }}</span>
              <span v-if="tagLine !== ''">{{ tagLine }}</span>
              <span class="sp">{{ SITE.meta.author }}</span>
            </div>
          </div>

          <div class="gate-disc" role="img" :aria-label="`${post.title} 的彩胶唱片`">
            <VinylDisc
              :catalog="post.track.catalog"
              :side="`SIDE ${post.track.side}`"
              :accent="post.track.accent"
            />
          </div>
        </div>
      </div>

      <!-- 移动端折叠目录（桌面隐藏，见 prose.css 的断点） -->
      <details v-if="hasToc" class="toc-mobile">
        <summary>曲目索引 · {{ headings.length }} 节</summary>
        <TocList :headings="headings" :active-id="activeId" />
      </details>

      <div class="post-wrap">
        <!-- 正文来自 `GET /api/posts/:slug` 的 `html`（服务端已渲染并转义），前端不再解析 Markdown -->
        <div ref="proseEl" class="prose" v-html="post.html" />

        <aside v-if="hasToc" class="toc">
          <h4>曲目索引</h4>
          <TocList :headings="headings" :active-id="activeId" />
        </aside>
      </div>

      <nav v-if="post.prev !== null || post.next !== null" class="pnav" aria-label="上一篇 / 下一篇">
        <RouterLink v-if="post.prev !== null" :to="`/posts/${post.prev.slug}`">
          <em>PREV · {{ post.prev.track.no }}</em>
          <b>{{ post.prev.title }}</b>
        </RouterLink>
        <span v-else aria-hidden="true" />

        <RouterLink v-if="post.next !== null" class="r" :to="`/posts/${post.next.slug}`">
          <em>NEXT · {{ post.next.track.no }}</em>
          <b>{{ post.next.title }}</b>
        </RouterLink>
      </nav>

      <!-- 配置齐全才渲染；v1 默认四项皆空，整块不存在 -->
      <GiscusComments />

      <div class="bigmark" aria-hidden="true">side {{ post.track.side }}</div>
    </template>
  </div>
</template>
