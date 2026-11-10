<script setup lang="ts">
/**
 * 关于页右侧的「唱片箱」插画（纯 SVG）。
 *
 * 直接照设计稿 04 屏的图形，只做了两处改动：
 * 1. 所有颜色换成 CSS 变量（`var(--color-v1..v4)`、`var(--color-ink)` 等），
 *    组件里不出现十六进制色值——色板只在 `styles/tokens.css` 定义一次。
 * 2. 加 `<title>`，让读屏软件也能读到这张图在说什么（纯装饰的图才用 `aria-hidden`）。
 *
 * 几何全部写死：预渲染与水合必须画出同一张图，任何随机量都会造成图文不一致。
 */
</script>

<template>
  <svg viewBox="0 0 300 400" role="img" aria-labelledby="crate-title">
    <title id="crate-title">一只装满彩胶唱片的木箱</title>

    <!-- 五张唱片，露出上半圈 -->
    <g stroke="var(--color-ink)" stroke-width="3">
      <circle cx="72" cy="128" r="58" fill="var(--color-v2)" />
      <circle cx="72" cy="128" r="13" fill="var(--color-bg)" />
      <circle cx="72" cy="128" r="2.6" fill="var(--color-ink)" />

      <circle cx="228" cy="128" r="56" fill="var(--color-v3)" />
      <circle cx="228" cy="128" r="12.5" fill="var(--color-bg)" />
      <circle cx="228" cy="128" r="2.6" fill="var(--color-ink)" />

      <circle cx="112" cy="100" r="52" fill="var(--color-v4)" />
      <circle cx="112" cy="100" r="12" fill="var(--color-bg)" />
      <circle cx="112" cy="100" r="2.6" fill="var(--color-ink)" />

      <circle cx="192" cy="98" r="50" fill="var(--color-paper)" />
      <circle cx="192" cy="98" r="11.5" fill="var(--color-bg)" />
      <circle cx="192" cy="98" r="2.6" fill="var(--color-ink)" />

      <circle cx="150" cy="112" r="62" fill="var(--color-v1)" />
      <circle cx="150" cy="112" r="14" fill="var(--color-bg)" />
      <circle cx="150" cy="112" r="2.8" fill="var(--color-ink)" />
    </g>

    <!-- 木箱与箱标 -->
    <g transform="rotate(-1.5 150 266)">
      <rect x="34" y="168" width="232" height="196" rx="8" fill="var(--color-mark)" stroke="var(--color-ink)" stroke-width="3" />
      <line x1="36" y1="234" x2="264" y2="234" stroke="var(--color-ink)" stroke-width="3" />
      <line x1="36" y1="300" x2="264" y2="300" stroke="var(--color-ink)" stroke-width="3" />
      <rect
        x="60"
        y="252"
        width="180"
        height="34"
        rx="4"
        fill="var(--color-bg)"
        stroke="var(--color-ink)"
        stroke-width="2.5"
      />
      <text
        x="150"
        y="275"
        text-anchor="middle"
        font-family="var(--font-mono)"
        font-size="14.5"
        font-weight="700"
        letter-spacing="4"
        fill="var(--color-ink)"
      >
        TINY—BLOGS
      </text>
    </g>
  </svg>
</template>
