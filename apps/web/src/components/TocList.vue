<script setup lang="ts">
/**
 * 目录列表：桌面侧栏（`.toc`）与移动端折叠块（`.toc-mobile`）共用一份渲染。
 *
 * 编号用两位序号（`01`、`02`）而不是标题文字的一部分：锚点 id 由 shared 的
 * `renderMarkdown` 固定分配为 `t1`、`t2`…，改标题不会让旧链接失效；
 * 序号只是视觉标注，跟着目录顺序走。
 */
import type { Heading } from '@tiny-blogs/shared';

defineProps<{
  /** 目录项（h2/h3，已按文档顺序排列）。 */
  readonly headings: readonly Heading[];
  /** 滚动跟随算出的当前项 id（预渲染期为 `null`）。 */
  readonly activeId?: string | null;
}>();

/**
 * 序号补零。
 *
 * @param index 从 0 开始的下标。
 * @returns 形如 `01`。
 */
function ordinal(index: number): string {
  return String(index + 1).padStart(2, '0');
}
</script>

<template>
  <ol>
    <li v-for="(heading, index) in headings" :key="heading.id" :class="{ lv3: heading.level === 3 }">
      <a :href="`#${heading.id}`" :class="{ on: heading.id === activeId }">
        <span>{{ ordinal(index) }}</span>
        {{ heading.text }}
      </a>
    </li>
  </ol>
</template>
