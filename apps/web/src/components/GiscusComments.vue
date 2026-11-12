<script setup lang="ts">
/**
 * 评论区（Giscus）。
 *
 * 验收点：`VITE_GISCUS_REPO` / `_REPO_ID` / `_CATEGORY` / `_CATEGORY_ID`
 * 任一为空则**整块不渲染**（连标题和分隔线都不出现），v1 默认就是这种状态。
 *
 * 实现要点：
 * - 判断放在模板的 `v-if` 上，不是挂载后 `display: none`——否则预渲染产物里会留下空容器。
 * - Giscus 的客户端脚本只能在浏览器里注入，所以放在 `onMounted`；预渲染期这块是空的，
 *   但这不影响 HTML 结构与 SEO（评论本来就不需要被爬）。
 * - 脚本参数与官方 embed 片段一一对应，改主题只需动 `data-theme` 一处。
 */
import { onMounted, ref } from 'vue';
import { isGiscusConfigured, webEnv } from '../env';

/** 评论配置（四项齐全才渲染）。 */
const giscus = webEnv.giscus;

/** 是否渲染整个区块。 */
const enabled = isGiscusConfigured(giscus);

/** Giscus 脚本挂载点。 */
const host = ref<HTMLElement | null>(null);

onMounted(() => {
  if (!enabled || host.value === null) {
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.async = true;
  script.crossOrigin = 'anonymous';

  const attributes: Readonly<Record<string, string>> = {
    'data-repo': giscus.repo,
    'data-repo-id': giscus.repoId,
    'data-category': giscus.category,
    'data-category-id': giscus.categoryId,
    // 用 pathname 映射：同一篇文章无论从哪个入口进来都是同一个讨论串。
    'data-mapping': 'pathname',
    'data-strict': '0',
    'data-reactions-enabled': '1',
    'data-emit-metadata': '0',
    'data-input-position': 'top',
    // 站点只有浅色主题，评论跟着走，避免一块深色区域割裂版面。
    'data-theme': 'light',
    'data-lang': 'zh-CN',
    'data-loading': 'lazy',
  };

  for (const [name, value] of Object.entries(attributes)) {
    script.setAttribute(name, value);
  }

  host.value.append(script);
});
</script>

<template>
  <section v-if="enabled" class="giscus" aria-label="留言">
    <h2>留言<span class="mk">板</span></h2>
    <p class="note">留言由 Giscus 提供，需要 GitHub 账号登录；同一篇文章共用一条讨论串。</p>
    <div ref="host" class="giscus-host" />
  </section>
</template>
