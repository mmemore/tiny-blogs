<script setup lang="ts">
/**
 * 搜索框：输入防抖 300ms 后向上抛出关键词，回车立即生效。
 *
 * 防抖状态放在组件内，URL 同步由页面负责（`?q=`），这样刷新/分享能还原搜索。
 */
import { onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 当前关键词（由 URL 驱动）。 */
    readonly modelValue: string;
    readonly placeholder?: string;
  }>(),
  { placeholder: '搜标题、正文或标签' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

/** 输入框里的即时值。 */
const draft = ref(props.modelValue);
/** 防抖计时器。 */
let timer: ReturnType<typeof setTimeout> | null = null;

// 外部（浏览器前进/后退）改了关键词时同步回输入框。
watch(
  () => props.modelValue,
  (value) => {
    if (value !== draft.value) {
      draft.value = value;
    }
  },
);

/**
 * 取消防抖并立即提交当前值。
 */
function flush(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  emit('update:modelValue', draft.value.trim());
}

/**
 * 输入时重启防抖。
 *
 * @param event 输入事件。
 */
function onInput(event: Event): void {
  draft.value = (event.target as HTMLInputElement).value;
  if (timer !== null) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    emit('update:modelValue', draft.value.trim());
  }, 300);
}

onBeforeUnmount(() => {
  if (timer !== null) {
    clearTimeout(timer);
  }
});
</script>

<template>
  <form class="search" role="search" @submit.prevent="flush">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </svg>
    <label class="sr-only" for="post-search">{{ placeholder }}</label>
    <input
      id="post-search"
      :value="draft"
      type="search"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
    />
  </form>
</template>
