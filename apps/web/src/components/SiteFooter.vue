<script setup lang="ts">
/**
 * 站脚：`© 年份 / 33⅓ RPM · PRESSED IN VUE 3 / 仓库链接`。
 *
 * 年份取建站年（`SITE.established`）而不是 `new Date()`：预渲染产物与浏览器水合
 * 必须算出同一个年份，否则跨年那一刻会出现水合不一致。仓库地址未配置时只显示文字，
 * 不渲染成死链。
 */
import { SITE } from '../site';
</script>

<template>
  <footer class="s-foot">
    <span>© {{ SITE.established }} {{ SITE.name }}</span>
    <span class="sp">33⅓ RPM · PRESSED IN VUE 3</span>
    <a v-if="SITE.repositoryUrl !== ''" :href="SITE.repositoryUrl" target="_blank" rel="noopener noreferrer">
      GitHub
    </a>
    <span v-else title="仓库地址未配置（VITE_SITE_REPO_URL）">GitHub</span>
  </footer>
</template>
