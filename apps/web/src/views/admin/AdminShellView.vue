<script setup lang="ts">
/**
 * 后台骨架（设计稿 09 屏的侧栏 + 顶栏）。
 *
 * 放在父路由上，列表页与标签页共用；编辑器是全幅页面，不走这里。
 *
 * 两个取舍：
 * - 设计稿侧栏有「概览」「设置」两项，v1 没有对应页面。**不做死链**（点进去空白比"少一项"更糟），
 *   只渲染真实存在的「文章」「标签」，其余留给后续版本；
 * - `NMessageProvider` / `NDialogProvider` 挂在这一层：子页面用 `useMessage()` 出轻提示、
 *   用 `useDialog()` 做二次确认，不必各自包一层 provider。
 */
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminThemeOverrides } from '../../admin/theme';
import { useSessionStore } from '../../stores/auth';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

/** 侧栏项：只有真实存在的页面。 */
const NAV = [
  { label: '文章', to: { name: 'admin-posts' }, match: (path: string) => path.startsWith('/admin/posts') },
  { label: '标签', to: { name: 'admin-tags' }, match: (path: string) => path.startsWith('/admin/tags') },
] as const;

/** 面包屑：一级按当前路径判定，二级在这些页面里恒为「全部」。 */
const crumb = computed(() =>
  route.path.startsWith('/admin/tags')
    ? { group: '标签管理', leaf: '全部' }
    : { group: '文章管理', leaf: '全部' },
);

/** 登录者显示名（头像取首字）。 */
const displayName = computed(() => session.principal?.username ?? '—');

/** 头像里的那个字。 */
const initial = computed(() => displayName.value.slice(0, 1).toUpperCase());

/**
 * 退出登录：吊销 refresh token → 清内存 → 回前台首页。
 *
 * 这里不弹提示：跳回前台首页本身就是最清楚的反馈，
 * 而 `useMessage()` 在"提供 provider 的同一个组件里"取不到实例（inject 只看祖先），
 * 硬用就得再拆一层组件，收益不抵复杂度。
 */
async function logout(): Promise<void> {
  await session.logout();
  await router.push({ name: 'home' });
}
</script>

<template>
  <NConfigProvider :theme-overrides="adminThemeOverrides">
    <NMessageProvider placement="top">
      <NDialogProvider>
        <div class="adm">
          <aside class="adm-side">
            <div class="adm-logo">tiny-blogs<i>后台</i></div>
            <nav class="adm-menu" aria-label="后台导航">
              <RouterLink
                v-for="item in NAV"
                :key="item.label"
                :to="item.to"
                :class="{ on: item.match(route.path) }"
              >
                <svg v-if="item.label === '文章'" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="3" width="16" height="18" rx="2" />
                  <path d="M9 8h6M9 12h6M9 16h4" />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 4h8l8 8-8 8-8-8z" stroke-linejoin="round" />
                  <circle cx="8.5" cy="8.5" r="1.4" />
                </svg>
                <span>{{ item.label }}</span>
              </RouterLink>
            </nav>
            <div class="adm-side-ft">
              <RouterLink :to="{ name: 'home' }">← 回到前台</RouterLink>
            </div>
          </aside>

          <div class="adm-main">
            <div class="adm-top">
              <div class="bc">{{ crumb.group }} / <b>{{ crumb.leaf }}</b></div>
              <div class="r">
                <span class="av" aria-hidden="true">{{ initial }}</span>
                <span class="who">{{ displayName }}</span>
                <button type="button" class="logout" @click="logout">退出</button>
              </div>
            </div>

            <div class="adm-body">
              <RouterView />
            </div>
          </div>
        </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.adm {
  display: grid;
  grid-template-columns: 216px 1fr;
  min-height: calc(100vh - 78px);
  font-size: 14px;
  background: var(--color-bg);
}

.adm-side {
  display: flex;
  flex-direction: column;
  background: var(--color-paper);
  border-right: 1px solid var(--color-line);
}

.adm-logo {
  display: flex;
  align-items: center;
  padding: 20px 18px 18px;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 13.5px;
  letter-spacing: -0.01em;
  color: var(--color-ink);
}

.adm-logo i {
  margin-left: 8px;
  font-family: var(--font-sans);
  font-style: normal;
  font-weight: 400;
  font-size: 10px;
  color: var(--color-faint);
}

.adm-menu a {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  margin: 2px 10px;
  padding: 0 12px;
  border-radius: 6px;
  color: var(--color-dim);
  font-size: 13.5px;
  transition:
    background 0.15s,
    color 0.15s;
}

.adm-menu a:hover {
  background: var(--color-bg);
  color: var(--color-ink);
}

.adm-menu a.on {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent-dark);
}

.adm-menu svg {
  width: 15px;
  height: 15px;
  flex: none;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.6;
}

.adm-side-ft {
  margin-top: auto;
  padding: 16px 18px;
  border-top: 1px solid var(--color-line);
  font-size: 12px;
  color: var(--color-faint);
}

.adm-side-ft a:hover {
  color: var(--color-ink);
}

.adm-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.adm-top {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 56px;
  padding: 0 28px;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-paper);
}

.bc {
  font-size: 13px;
  color: var(--color-faint);
}

.bc b {
  font-weight: 500;
  color: var(--color-ink);
}

.adm-top .r {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  font-size: 12.5px;
  color: var(--color-dim);
}

.av {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-ink);
  color: var(--color-bg);
  font-size: 11px;
  font-weight: 700;
}

.logout {
  padding: 4px 10px;
  border: 1px solid var(--color-line2);
  border-radius: 4px;
  background: var(--color-paper);
  color: var(--color-dim);
  font-size: 12px;
  cursor: pointer;
}

.logout:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-dark);
}

.adm-body {
  padding: 24px 28px 30px;
}

@media (max-width: 860px) {
  .adm {
    grid-template-columns: 1fr;
  }

  .adm-side {
    border-right: 0;
    border-bottom: 1px solid var(--color-line);
  }

  .adm-side-ft {
    margin-top: 0;
  }

  .adm-body {
    padding: 18px 16px 24px;
  }
}
</style>
