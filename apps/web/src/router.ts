/**
 * 路由表。
 *
 * 预渲染纪律（票 10 会按这张表生成静态页）：
 * - 每条路由都是一个**具名**的页面，slug 只作为参数；
 * - 后台入口 `/admin` 必须是懒加载，且不得进入预渲染范围（那会在公开站点上生成后台页面）；
 * - 关于页虽然是前台页面，但也懒加载：它是唯一会把 `markdown-it` 拖进 chunk 的页面
 *   （正文来自本地 Markdown），不能让它占用主包；
 * - 兜底路由放在最后，保证未知路径有 404 而不是白屏。
 *
 * 守卫纪律（票 08）：鉴权判定放在**路由层**而不是组件 `onMounted`。
 * 后者的问题不是"多了几行"，而是页面在拿到结论前已经渲染过一帧——
 * 未登录的访客会先看见后台骨架再被弹走，中间那一帧还可能发起真实的后台请求。
 */
import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw } from 'vue-router';
import { registerExpiredHandler } from './api/session';
import ArchivesView from './views/ArchivesView.vue';
import HomeView from './views/HomeView.vue';
import NotFoundView from './views/NotFoundView.vue';
import PostDetailView from './views/PostDetailView.vue';
import PostListView from './views/PostListView.vue';
import TagsView from './views/TagsView.vue';
import { useSessionStore } from './stores/auth';

/** 登录页路由名（守卫与"会话失效"跳转共用，避免到处写字面量）。 */
export const LOGIN_ROUTE = 'admin-login';

/** 后台列表路由名（登录成功后的默认落点）。 */
export const ADMIN_HOME_ROUTE = 'admin-posts';

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
    path: '/admin/login',
    name: LOGIN_ROUTE,
    // 懒加载 + `naive-ui` 只在这条子树里出现，前台入口 chunk 不会带上组件库。
    component: () => import('./views/admin/AdminLoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/admin',
    // 后台骨架（侧栏 + 面包屑）挂在父路由上，列表与标签页共用。
    component: () => import('./views/admin/AdminShellView.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: ADMIN_HOME_ROUTE } },
      {
        path: 'posts',
        name: ADMIN_HOME_ROUTE,
        component: () => import('./views/admin/AdminPostsView.vue'),
      },
      {
        path: 'tags',
        name: 'admin-tags',
        component: () => import('./views/admin/AdminTagsView.vue'),
      },
    ],
  },
  /**
   * 编辑器是**全幅**页面（设计稿 10 屏没有侧栏），因此从骨架路由里提出来单列。
   * 新建与编辑共用一个组件，靠 `slug` 参数区分。
   */
  {
    path: '/admin/posts/new',
    name: 'admin-post-new',
    component: () => import('./views/admin/AdminEditorView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/posts/:slug/edit',
    name: 'admin-post-edit',
    component: () => import('./views/admin/AdminEditorView.vue'),
    meta: { requiresAuth: true },
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

/**
 * 把当前地址塞进 `redirect` 查询参数，登录后原地返回。
 *
 * @param to 被拦截的目标路由。
 * @returns 登录页的位置。
 */
function toLogin(to: RouteLocationNormalized): { name: string; query: Record<string, string> } {
  const redirect = to.fullPath.startsWith('/admin') ? to.fullPath : '/admin/posts';
  return { name: LOGIN_ROUTE, query: { redirect } };
}

router.beforeEach(async (to) => {
  const needsAuth = to.matched.some((record) => record.meta.requiresAuth === true);
  const guestOnly = to.matched.some((record) => record.meta.guestOnly === true);
  if (!needsAuth && !guestOnly) {
    return true;
  }

  const session = useSessionStore();
  const signedIn = await session.ensureSession();

  if (needsAuth && !signedIn) {
    return toLogin(to);
  }
  if (guestOnly && signedIn) {
    return { name: ADMIN_HOME_ROUTE };
  }
  return true;
});

// 会话在页面使用期间失效（refresh 也救不回来）时，由 API 层通知到这里统一跳转。
registerExpiredHandler(setSessionExpired);

/**
 * 清掉 store 里的会话并跳登录页（当前已在登录页时不再跳，免得刷屏）。
 */
function setSessionExpired(): void {
  const session = useSessionStore();
  session.clear();

  const current = router.currentRoute.value;
  if (current.name === LOGIN_ROUTE) {
    return;
  }
  void router.replace(toLogin(current));
}
