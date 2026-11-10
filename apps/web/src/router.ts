/**
 * 路由表。
 *
 * 预渲染纪律（票 10 会按这张表生成静态页）：
 * - 每条路由都是一个**具名**的页面，slug 只作为参数；
 * - 后台入口 `/admin` 必须是懒加载，且不得进入预渲染范围（那会在公开站点上生成后台页面）；
 * - 关于页虽然是前台页面，但也懒加载：它是唯一会把 `markdown-it` 拖进 chunk 的页面
 *   （正文来自本地 Markdown），不能让它占用主包；
 * - 兜底路由放在最后，保证未知路径有 404 而不是白屏。
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import ArchivesView from './views/ArchivesView.vue';
import HomeView from './views/HomeView.vue';
import NotFoundView from './views/NotFoundView.vue';
import PostDetailView from './views/PostDetailView.vue';
import PostListView from './views/PostListView.vue';
import TagsView from './views/TagsView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/posts', name: 'posts', component: PostListView },
  { path: '/posts/:slug', name: 'post', component: PostDetailView },
  // 标签总览与标签筛选是两张不同的页面，只是筛选页复用了列表页组件（票 07 要求复用）。
  { path: '/tags', name: 'tags', component: TagsView },
  { path: '/tags/:slug', name: 'tag', component: PostListView },
  { path: '/archives', name: 'archives', component: ArchivesView },
  {
    path: '/about',
    name: 'about',
    // 懒加载：关于页的正文由 markdown-it 渲染，放进主包会让首屏多背一个解析器。
    component: () => import('./views/AboutView.vue'),
  },
  {
    path: '/admin',
    name: 'admin',
    // 懒加载：后台代码（后续会引入 Naive UI）不能进前台首屏 chunk。
    component: () => import('./views/AdminPlaceholderView.vue'),
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  /**
   * 滚动行为：浏览器前进/后退还原位置，锚点跳转留出站头高度，其余回到顶部。
   *
   * @param to 目标路由。
   * @param _from 来源路由（未使用）。
   * @param savedPosition 浏览器记录的位置。
   * @returns 滚动目标。
   */
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition !== null) {
      return savedPosition;
    }
    if (to.hash !== '') {
      return { el: to.hash, top: 96, behavior: 'smooth' };
    }
    return { top: 0 };
  },
});
