<script setup lang="ts">
/**
 * `/admin` 占位页。
 *
 * 后台的登录、列表、编辑器由票 08 / 09 实现（届时接 Naive UI）。这里只保证：
 * 1. 站点导航里的"后台"不是死链；
 * 2. **不引入** Naive UI 或任何后台代码 —— 本文件是懒加载的，
 *    前台首屏 chunk 里不会有它的字节。
 */
import { pageTitle, usePageMeta } from '../composables/usePageMeta';

usePageMeta(() => ({
  title: pageTitle('员工通道'),
  description: '写作后台施工中。',
  noindex: true,
}));
</script>

<template>
  <div class="screen">
    <div class="list-head">
      <h1>员工<span class="mk">通道</span></h1>
      <span class="n">BACKSTAGE · 施工中</span>
    </div>

    <div class="state">
      <h2>压片机还没通电</h2>
      <p>
        这里将是登录、文章管理与 Markdown 编辑器。它们由后台批次实现，本批只留出入口，
        因此你现在看到的是这张字条——而不是一个 404。
      </p>
      <div class="act">
        <RouterLink class="tk-link" to="/">回到前台</RouterLink>
        <RouterLink class="tk-link" to="/posts">看曲目表</RouterLink>
      </div>
    </div>
  </div>
</template>
