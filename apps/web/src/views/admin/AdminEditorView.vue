<script setup lang="ts">
/**
 * 编辑器外壳：只负责挂 Naive 的三个 provider，业务全在 `AdminEditorPanel.vue`。
 *
 * 为什么多这一层：`useMessage()` / `useDialog()` 靠 inject 找**祖先**的 provider，
 * 同一个组件里"自己提供自己消费"是拿不到实例的。而 provider 又必须挂在
 * `/admin` 子树（naive-ui 不能进前台入口 chunk），所以路由入口组件做壳、
 * 业务组件做里，各干各的。
 */
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui';
import { adminThemeOverrides } from '../../admin/theme';
import AdminEditorPanel from './AdminEditorPanel.vue';
</script>

<template>
  <NConfigProvider :theme-overrides="adminThemeOverrides">
    <NMessageProvider placement="top">
      <NDialogProvider>
        <AdminEditorPanel />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
