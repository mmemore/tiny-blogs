<script setup lang="ts">
/**
 * 彩胶唱片（纯 SVG）。
 *
 * 两个约束：
 * 1. 密纹用固定公式生成，**不能**用 `Math.random()`——预渲染与水合必须画出同一张唱片。
 * 2. 颜色全部走 CSS 变量，组件里没有十六进制色值；`accent` 只决定胶体颜色。
 */
import { computed, useId } from 'vue';
import type { Accent } from '@tiny-blogs/shared';
import { accentColor } from '../lib/format';

const props = withDefaults(
  defineProps<{
    /** 目录号，如 `TB—001`。 */
    readonly catalog: string;
    /** 面号，如 `SIDE A`。 */
    readonly side: string;
    /** 胶体配色。 */
    readonly accent: Accent;
    /** 转速标注。 */
    readonly rpm?: string;
  }>(),
  { rpm: '33⅓' },
);

/** 渐变 id 必须唯一：同页可能有多张唱片（首页 hero、404）。 */
const sheenId = useId();

/** 胶体颜色。 */
const fill = computed(() => accentColor(props.accent));

/** 密纹环：半径从内到外，透明度按固定序列抖动，模拟压纹的不均匀。 */
const grooves = computed(() => {
  const rings: Array<{ radius: string; opacity: string }> = [];
  let index = 0;
  for (let radius = 36; radius <= 96; radius += 2.4) {
    rings.push({
      radius: radius.toFixed(1),
      opacity: (0.14 + ((index * 37) % 28) / 100).toFixed(2),
    });
    index += 1;
  }
  return rings;
});
</script>

<template>
  <svg viewBox="0 0 200 200" aria-hidden="true">
    <defs>
      <linearGradient :id="sheenId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--color-paper)" stop-opacity="0.22" />
        <stop offset="0.45" stop-color="var(--color-paper)" stop-opacity="0.04" />
        <stop offset="1" stop-color="var(--color-paper)" stop-opacity="0.16" />
      </linearGradient>
    </defs>

    <circle cx="100" cy="100" r="99" :fill="fill" />
    <circle cx="100" cy="100" r="99" fill="none" stroke="var(--color-ink)" stroke-width="1.4" />
    <circle
      v-for="(ring, index) in grooves"
      :key="index"
      cx="100"
      cy="100"
      :r="ring.radius"
      fill="none"
      stroke="var(--color-ink)"
      stroke-width="0.6"
      :opacity="ring.opacity"
    />
    <circle cx="100" cy="100" r="99" :fill="`url(#${sheenId})`" />

    <!-- 纸标签 -->
    <circle cx="100" cy="100" r="34" fill="var(--color-paper)" />
    <circle cx="100" cy="100" r="34" fill="none" stroke="var(--color-ink)" stroke-width="1.4" />
    <circle cx="100" cy="100" r="3.4" fill="var(--color-ink)" />
    <text
      x="100"
      y="86"
      text-anchor="middle"
      font-family="var(--font-mono)"
      font-size="7"
      letter-spacing="1.4"
      fill="var(--color-faint)"
    >
      {{ side }}
    </text>
    <text
      x="100"
      y="115"
      text-anchor="middle"
      font-family="var(--font-mono)"
      font-size="8"
      font-weight="700"
      letter-spacing="0.8"
      fill="var(--color-ink)"
    >
      {{ catalog }}
    </text>
    <text
      x="100"
      y="126"
      text-anchor="middle"
      font-family="var(--font-mono)"
      font-size="6.5"
      letter-spacing="1.2"
      fill="var(--color-faint)"
    >
      {{ rpm }} RPM
    </text>
  </svg>
</template>
