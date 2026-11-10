<script setup lang="ts">
/**
 * 应用外壳：站头 + 路由出口 + 站脚。
 *
 * 这里刻意不写 `RouterView` 的 `:key="route.fullPath"`：页面组件自己在 `watch` 里响应参数变化，
 * 免得每次翻页都整页重建（那会让滚动位置与"旧内容淡出"都变得不可控）。
 */
import SiteFooter from './components/SiteFooter.vue';
import SiteHeader from './components/SiteHeader.vue';
</script>

<template>
  <a class="skip-link" href="#main">跳到正文</a>
  <SiteHeader />
  <main id="main">
    <RouterView />
  </main>
  <SiteFooter />
</template>

<style scoped>
/* 键盘用户跳过导航；视觉上平时不可见 */
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
  padding: 10px 18px;
  background: var(--color-ink);
  color: var(--color-paper);
  font-size: 12.5px;
}

.skip-link:focus-visible {
  left: 12px;
  top: 12px;
}
</style>
