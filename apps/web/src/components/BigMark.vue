<script setup lang="ts">
/**
 * 页脚大字水印 + 一条**贴着字形底部**的分界线。
 *
 * 为什么不用 `border-bottom`：等距的横线在 "side A"（没有下延字母）下会空出
 * 一大截，在 "tiny—blogs"（有 g）下又必须整体下移给下延让位。两种需求互相矛盾，
 * 唯一的解法是让线自己走形：字母底边在哪儿，线就在哪儿；遇到 g/y/p/q/j 就向下凹。
 *
 * 实现：文字按字符拆成 `inline-block` 撑开量测（`display: inline-block` 保住
 * 中文与空格的宽度），逐个取 `getBoundingClientRect()`，用基线（无下延字符的
 * 底边最高值）串成一条 path，下延字符处用两段三次贝塞尔凹下去。
 *
 * 量测只在客户端发生（`onMounted` + 字体就绪 + ResizeObserver）：预渲染产物里
 * 只有字形本身，线是纯装饰（`aria-hidden`），首帧缺失不影响内容与 SEO。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  /** 水印文字（单行，不换行）。 */
  readonly text: string;
}>();

/** 字符数组：按码点拆，避免 emoji/代理对拆坏。 */
const chars = computed(() => Array.from(props.text));

/** 有下延的字母：线在这些字下面绕行。 */
const DESCENDERS = new Set(['g', 'j', 'p', 'q', 'y']);

/** 线与字形之间留的空隙（px）。 */
const GAP = 4;

/** 线的中线相对基线的偏移：让 2px 描边整体落在字母底边之下，不压住笔画。 */
const LINE_OFFSET = 1.5;

const root = ref<HTMLElement | null>(null);
const pathD = ref('');

/**
 * 复用的离屏画布：只用来取字形墨迹度量，不参与渲染。
 * 惰性创建——模块顶层碰 `document` 会让预渲染（SSR）直接崩掉。
 */
let measureCanvas: HTMLCanvasElement | null = null;

/**
 * 量测并把 path 串出来。
 *
 * 基线取各字 `inline-block` 盒的底边：`line-height: 0.82` 下所有盒等高且按基线对齐，
 * 非下延字符的盒底就是基线。
 *
 * 下延深度**不能**用盒底算——盒高被 `line-height` 压扁了，量出来只有基线下方几像素，
 * 线会横穿 y/g 的尾巴。这里改用 canvas 的字形墨迹度量（`actualBoundingBoxDescent`
 * 与左右边界），拿到的是笔画真实压到哪儿，凹陷因此贴着字形走。
 */
function buildPath(): void {
  const el = root.value;
  if (el === null) {
    return;
  }
  const spans = Array.from(el.querySelectorAll<HTMLElement>('.bm-ch'));
  if (spans.length === 0) {
    return;
  }
  const box = el.getBoundingClientRect();
  const rects = spans.map((span) => span.getBoundingClientRect());

  // 基线 = 无下延字符的底边最大值。用 max 而不是直接取第一个：
  // 破折号这类"不贴基线"的字符底边偏高，取最大才拿到真正的基线。
  const baselines = rects
    .filter((_rect, index) => !DESCENDERS.has((chars.value[index] ?? '').toLowerCase()))
    .map((rect) => rect.bottom - box.top);
  if (baselines.length === 0) {
    return;
  }
  const baseline = Math.max(...baselines) + LINE_OFFSET;
  const width = box.width;

  // 与字形同款的字体串：权重/字号/字族都取自元素计算样式。
  const style = getComputedStyle(el);
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  measureCanvas ??= document.createElement('canvas');
  const context = measureCanvas.getContext('2d');
  if (context !== null) {
    context.font = font;
  }

  const parts: string[] = [`M0 ${baseline.toFixed(1)}`];
  let prevEnd = 0;

  for (let index = 0; index < rects.length; index += 1) {
    const char = chars.value[index] ?? '';
    const rect = rects[index];
    if (rect === undefined || !DESCENDERS.has(char.toLowerCase())) {
      continue;
    }
    const x0 = rect.left - box.left;
    const x1 = rect.right - box.left;
    const metrics = context === null ? null : context.measureText(char);
    // 墨迹边界：比字的排版盒窄，曲线才会恰好包住笔画、不延伸到邻字下方。
    const inkLeft = metrics === null ? x0 : Math.max(x0, x0 - metrics.actualBoundingBoxLeft);
    const inkRight = metrics === null ? x1 : Math.min(x1, x0 + metrics.actualBoundingBoxRight);
    const depth =
      metrics === null ? (x1 - x0) * 0.2 : Math.max(metrics.actualBoundingBoxDescent, 0);
    const dip = baseline + depth + GAP;
    const pad = 4;
    const start = Math.max(prevEnd, inkLeft - pad);
    const end = Math.max(start + 6, inkRight + pad);
    const mid = (start + end) / 2;
    parts.push(`L${start.toFixed(1)} ${baseline.toFixed(1)}`);
    parts.push(
      `C${start.toFixed(1)} ${dip.toFixed(1)} ${mid.toFixed(1)} ${dip.toFixed(1)} ${mid.toFixed(1)} ${dip.toFixed(1)}`,
    );
    parts.push(
      `C${end.toFixed(1)} ${dip.toFixed(1)} ${end.toFixed(1)} ${baseline.toFixed(1)} ${end.toFixed(1)} ${baseline.toFixed(1)}`,
    );
    prevEnd = end;
  }

  parts.push(`L${width.toFixed(1)} ${baseline.toFixed(1)}`);
  pathD.value = parts.join(' ');
}

/** 尺寸变化（字号是 vw 级联）后重算；每帧最多一次。 */
let frame = 0;
function scheduleBuild(): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frame);
  }
  frame = requestAnimationFrame(buildPath);
}

let observer: ResizeObserver | null = null;

onMounted(async () => {
  // 自定义展示字体就绪前后，字形宽度会变；等它落定再量。
  if (document.fonts !== undefined) {
    await document.fonts.ready;
  }
  await nextTick();
  buildPath();
  observer = new ResizeObserver(scheduleBuild);
  if (root.value !== null) {
    observer.observe(root.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frame);
  }
});

watch(chars, async () => {
  await nextTick();
  buildPath();
});
</script>

<template>
  <div ref="root" class="bigmark" aria-hidden="true">
    <span v-for="(char, index) in chars" :key="index" class="bm-ch">{{ char }}</span>
    <svg class="bm-rule">
      <path :d="pathD" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </div>
</template>
