<script setup lang="ts">
/**
 * 通用状态块：空态 / 错误态 的正文区。
 *
 * 三种"这里没有内容"的场景共用一套排版，避免每个页面各写一遍提示结构；
 * 需要额外动作（比如"重试"按钮）时走默认插槽。
 */
import type { RouteLocationRaw } from 'vue-router';

defineProps<{
  /** 主标题。 */
  readonly title: string;
  /** 说明文字。 */
  readonly description?: string;
  /** 行动按钮文案（与 `ctaTo` 同时给出才渲染）。 */
  readonly ctaLabel?: string;
  /** 行动按钮目标。 */
  readonly ctaTo?: RouteLocationRaw;
}>();
</script>

<template>
  <div class="state" role="status">
    <h2>{{ title }}</h2>
    <p v-if="description !== undefined">{{ description }}</p>
    <div v-if="$slots.default !== undefined || (ctaLabel !== undefined && ctaTo !== undefined)" class="act">
      <RouterLink v-if="ctaLabel !== undefined && ctaTo !== undefined" class="tk-link" :to="ctaTo">
        {{ ctaLabel }}
      </RouterLink>
      <slot />
    </div>
  </div>
</template>
