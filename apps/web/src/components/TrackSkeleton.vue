<script setup lang="ts">
/**
 * 曲目表的加载骨架：保持与真实行相同的栅格与行高，避免数据到位时页面跳动。
 */
withDefaults(defineProps<{ readonly rows?: number }>(), { rows: 8 });
</script>

<template>
  <div class="skeleton" aria-hidden="true">
    <div v-for="index in rows" :key="index" class="row">
      <span class="bar" style="width: 26px" />
      <span class="bar" :style="{ width: `${52 + ((index * 13) % 34)}%` }" />
      <span class="bar" style="width: 96px" />
      <span class="bar" style="width: 34px" />
      <span class="bar" style="width: 22px" />
    </div>
  </div>
</template>
