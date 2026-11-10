/**
 * 应用入口：Pinia → head → router，最后挂载。
 *
 * 两个刻意的选择：
 * 1. **等 `router.isReady()` 再挂载**：首个路由已经解析完组件（含懒加载路由与
 *    `onServerPrefetch` 启动的请求）后才渲染，避免"先闪一下空壳页面"。
 * 2. **head 用 `@unhead/vue/client` 的 `createHead`**：预渲染（票 10）在 Node 侧用
 *    `@unhead/vue/server` 的同一套 API，因此 `<title>` / OG 的写法定稿一次，
 *    构建产物与浏览器运行时不会出现两套 head。
 */
import { createHead } from '@unhead/vue/client';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/index.css';

const app = createApp(App);

app.use(createPinia());
app.use(createHead());
app.use(router);

void router.isReady().then(() => {
  app.mount('#app');
});
