/**
 * 应用入口（vite-ssg 约定）。
 *
 * 入口改为 vite-ssg 的 `ViteSSG()` 工厂：
 * - 浏览器端：模块加载时自动创建应用并挂载（vite-ssg 内部处理），
 *   仍然是"等首个路由解析完再渲染"，不闪空壳；
 * - 预渲染端：vite-ssg 对**每一页**调用一次 `createApp(route)`，拿到独立的应用、
 *   Pinia、路由（memory history）与 head 实例，渲染完即弃。
 *
 * 两个容易踩的点，这里注释留档：
 * 1. `App.vue` 里没有任何 `onMounted` 数据请求 —— 首屏数据全部走 `useAsyncData`
 *   （setup 阶段 + `onServerPrefetch`），所以预渲染出的 HTML 直接带正文；
 * 2. `<head>` 由 vite-ssg 创建的 unhead 实例接管（`useHead: true` 是默认值），
 *   页面只声明 `usePageMeta()`，服务端写入 HTML、客户端水合复用同一份声明。
 *
 * 第三个点（实测踩到的坑，值得写下来）：`useAsyncData` 的缓存表必须**按 app 装**，
 * 否则同进程里预渲染 20 个页面会共用一张表，`post:detail` 这种常量 key 让所有文章页
 * 渲染成同一篇。见 `installAsyncDataCache`。
 */
import { createPinia } from 'pinia';
import { ViteSSG } from 'vite-ssg';
import App from './App.vue';
import { installAsyncDataCache } from './composables/useAsyncData';
import { includedRoutes } from './prerender-routes';
import { attachGuards, routes } from './router';
import './styles/index.css';

export const createApp = ViteSSG(
  App,
  // base 必须与构建产物部署的子路径一致（`vite.config.ts` 的 `base` 同源），
  // 否则项目站点（形如 `/<repo>/`）上的路由与资源都会 404。
  { routes, base: import.meta.env.BASE_URL },
  ({ app, router }) => {
    app.use(createPinia());
    app.use(installAsyncDataCache);
    attachGuards(router);
  },
);

// vite-ssg 服务端入口从这里取"渲染哪些路由"（见 prerender-routes.ts 的纪律说明）。
export { includedRoutes };
