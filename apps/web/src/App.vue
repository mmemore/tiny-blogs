<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { API_PREFIX, type ErrorEnvelope, type HealthResponse } from '@tiny-blogs/shared';

/**
 * 占位页：票 01 只验证三件事——web 能热更新、跨包类型可用、API 可达。
 * 真正的首页/文章页由后续票（读侧、UI）替换掉这个组件。
 */
const health = ref<HealthResponse | null>(null);
const failure = ref<string | null>(null);
const pending = ref(false);

/** 通过同源 `/api` 探活；dev 期由 Vite 代理转发到 Nest。 */
async function probeHealth(): Promise<void> {
  pending.value = true;
  failure.value = null;
  try {
    const response = await fetch(`/${API_PREFIX}/health`, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      const payload = (await response.json()) as ErrorEnvelope;
      failure.value = `${response.status} ${payload.error.code}：${payload.error.message}`;
      health.value = null;
      return;
    }
    health.value = (await response.json()) as HealthResponse;
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error);
    health.value = null;
  } finally {
    pending.value = false;
  }
}

onMounted(() => {
  void probeHealth();
});
</script>

<template>
  <main class="shell">
    <header class="hero">
      <p class="eyebrow">tiny-blogs · v1</p>
      <h1>工程骨架已就位</h1>
      <p class="lede">
        这是票 01 的占位页。它存在的意义只有三个：证明 Vite 热更新可用、跨包类型可引用、API 能被访问到。
        文章列表、详情、标签与后台都会在后续票里替换掉这里。
      </p>
    </header>

    <section class="panel" aria-labelledby="health-heading">
      <h2 id="health-heading">API 探活</h2>
      <p class="hint">GET /api/health</p>

      <div class="status" role="status" aria-live="polite">
        <template v-if="pending">正在请求…</template>
        <template v-else-if="health">
          <span class="dot ok" aria-hidden="true"></span>
          <span>status={{ health.status }} · uptime={{ health.uptime }}s</span>
        </template>
        <template v-else>
          <span class="dot bad" aria-hidden="true"></span>
          <span>{{ failure ?? 'API 不可达' }}</span>
        </template>
      </div>

      <button type="button" :disabled="pending" @click="probeHealth">重新探活</button>
    </section>

    <footer class="foot">
      <span>Vue 3 + Vite · NestJS · MySQL 8</span>
      <span>下一步：数据库 schema 与迁移（票 02）</span>
    </footer>
  </main>
</template>

<style scoped>
.shell {
  max-width: 44rem;
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 4rem) 1.25rem;
  display: grid;
  gap: 2rem;
}

.eyebrow {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

h1 {
  margin: 0 0 1rem;
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.lede {
  margin: 0;
  max-width: 38rem;
  line-height: 1.75;
  color: var(--muted);
}

.panel {
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  padding: 1.25rem 1.25rem 1.5rem;
  background: var(--surface);
}

.panel h2 {
  margin: 0;
  font-size: 1rem;
}

.hint {
  margin: 0.25rem 0 1rem;
  font-family: var(--mono);
  font-size: 0.8125rem;
  color: var(--muted);
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.75rem;
  font-family: var(--mono);
  font-size: 0.875rem;
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  flex: none;
}

.dot.ok {
  background: var(--ok);
}

.dot.bad {
  background: var(--bad);
}

button {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--ink);
}

button:disabled {
  cursor: progress;
  opacity: 0.6;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  justify-content: space-between;
  border-top: 1px solid var(--line);
  padding-top: 1rem;
  font-size: 0.8125rem;
  color: var(--muted);
}
</style>
