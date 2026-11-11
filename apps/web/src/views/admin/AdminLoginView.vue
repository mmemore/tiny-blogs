<script setup lang="ts">
/**
 * 登录页（设计稿 08 屏「员工通道」）。
 *
 * 三件事：
 * 1. 表单用 Naive 的 `NForm` + `NInput`（视觉仍是设计稿的胶囊输入框，靠 CSS 变量对齐）；
 * 2. 错误分流：401 `INVALID_CREDENTIALS` → "用户名或密码不正确"；
 *    429 `RATE_LIMITED` → 服务端给的"请求过于频繁"文案（后端没给剩余秒数就如实转述，
 *    不自己编一个倒计时）；
 * 3. 成功后跳 `?redirect=` 指向的地址（默认 `/admin/posts`）。
 */
import { NAlert, NButton, NConfigProvider, NForm, NFormItem, NInput, zhCN } from 'naive-ui';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiRequestError } from '../../api/client';
import { adminThemeOverrides } from '../../admin/theme';
import { ADMIN_HOME_ROUTE } from '../../router';
import { useSessionStore } from '../../stores/auth';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

/** 表单模型。 */
const form = ref({ username: '', password: '' });

/** 提交中（禁用按钮，避免连点触发两次登录、把限流额度用光）。 */
const submitting = ref(false);

/** 服务端错误文案（空串表示无错误）。 */
const errorMessage = ref('');

/** 前端校验规则：只做"非空"，正确性由服务端判定。 */
const rules = {
  username: { required: true, message: '请输入用户名', trigger: ['blur', 'input'] },
  password: { required: true, message: '请输入密码', trigger: ['blur', 'input'] },
};

/** 登录后要去的地址：只接受站内 `/admin` 开头的路径，避免被 `?redirect=` 带去外站。 */
const redirectTarget = computed<string | { name: string }>(() => {
  const raw = route.query.redirect;
  if (typeof raw === 'string' && raw.startsWith('/admin') && !raw.startsWith('//')) {
    return raw;
  }
  return { name: ADMIN_HOME_ROUTE };
});

/**
 * 把异常翻译成一句人话。
 *
 * @param error 捕获到的异常。
 * @returns 展示用文案。
 */
function describe(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return '用户名或密码不正确';
    }
    if (error.status === 429) {
      return error.message;
    }
    return error.message;
  }
  return '网络异常，请稍后再试';
}

/** 提交登录。 */
async function submit(): Promise<void> {
  if (submitting.value) {
    return;
  }
  errorMessage.value = '';
  submitting.value = true;
  try {
    await session.login(form.value.username.trim(), form.value.password);
    // 用 `replace`：登录页不该留在历史里（返回键不应该回到登录表单）。
    await router.replace(redirectTarget.value);
  } catch (error) {
    errorMessage.value = describe(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <NConfigProvider :theme-overrides="adminThemeOverrides" :locale="zhCN">
    <section class="lg">
      <div class="lg-card">
        <div class="stamp" aria-hidden="true">STAFF<small>ONLY</small></div>
        <div class="sk">BACKSTAGE · 后台入口</div>
        <h1>员工<span class="mk">通道</span></h1>

        <NForm :model="form" :rules="rules" :show-require-mark="false" @submit.prevent="submit">
          <div class="lg-field">
            <label for="admin-username">用户名</label>
            <NFormItem path="username" :show-label="false" class="lg-item">
              <NInput
                id="admin-username"
                v-model:value="form.username"
                placeholder="store manager"
                autocomplete="username"
                :input-props="{ autocapitalize: 'off', autocorrect: 'off' }"
                @keydown.enter.prevent="submit"
              />
            </NFormItem>
          </div>

          <div class="lg-field">
            <label for="admin-password">密码</label>
            <NFormItem path="password" :show-label="false" class="lg-item">
              <NInput
                id="admin-password"
                v-model:value="form.password"
                type="password"
                show-password-on="click"
                placeholder="••••••••"
                autocomplete="current-password"
                @keydown.enter.prevent="submit"
              />
            </NFormItem>
          </div>

          <NAlert v-if="errorMessage !== ''" type="error" :bordered="false" class="lg-alert">
            {{ errorMessage }}
          </NAlert>

          <NButton type="primary" attr-type="submit" block class="lg-btn" :loading="submitting">
            进入后台
          </NButton>
        </NForm>

        <div class="lg-ft">
          <RouterLink :to="{ name: 'home' }">← 回到前台</RouterLink>
          <span class="rpm">33⅓ RPM</span>
        </div>
      </div>

      <!-- 彩胶作为背景装饰：纯 CSS 圆环，不引 SVG 也不额外请求图片 -->
      <div class="lg-disc" aria-hidden="true" />
    </section>
  </NConfigProvider>
</template>

<style scoped>
.lg {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 560px;
  padding: 72px 24px 90px;
  overflow: hidden;
}

.lg-card {
  position: relative;
  z-index: 2;
  width: min(400px, 100%);
  background: var(--color-paper);
  border: 2px solid var(--color-ink);
  border-radius: 12px;
  box-shadow: var(--shadow-ink);
  padding: 34px 34px 24px;
}

.stamp {
  position: absolute;
  top: -18px;
  right: -18px;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: var(--color-accent-dark);
  border: 2px solid var(--color-ink);
  color: var(--color-paper);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transform: rotate(10deg);
  font-weight: 900;
  font-size: 14px;
  line-height: 1.15;
  box-shadow: var(--shadow-ink-sm);
}

.stamp small {
  font-size: 6.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.sk {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-faint);
}

h1 {
  margin: 12px 0 4px;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: var(--color-ink);
}

.mk {
  background: linear-gradient(transparent 58%, var(--color-mark) 58%, var(--color-mark) 92%, transparent 92%);
  padding: 0 2px;
}

.lg-field {
  margin-top: 18px;
}

.lg-field > label {
  display: block;
  margin-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-faint);
}

/* 用 Naive 暴露的 CSS 变量把它改成设计稿的胶囊输入框，不写死任何色值 */
.lg-item :deep(.n-input) {
  --n-height: 44px;
  --n-border-radius: 999px;
  --n-border: 1.5px solid var(--color-ink);
  --n-border-hover: 1.5px solid var(--color-ink);
  --n-border-focus: 1.5px solid var(--color-ink);
  --n-box-shadow-focus: 3px 3px 0 var(--color-ink);
  --n-color: var(--color-bg);
  --n-color-focus: var(--color-paper);
  --n-font-size: 14px;
  --n-text-color: var(--color-ink);
  --n-placeholder-color: var(--color-faint);
  --n-caret-color: var(--color-accent-dark);
  --n-padding-left: 16px;
}

.lg-item :deep(.n-form-item-feedback-wrapper) {
  --n-feedback-height: 22px;
}

.lg-item :deep(.n-form-item-blank) {
  min-height: 0;
}

.lg-alert {
  margin-top: 14px;
  border-radius: 8px;
}

.lg-btn {
  margin-top: 22px;
  --n-height: 44px;
  --n-border-radius: 999px;
  --n-border: 2px solid var(--color-ink);
  --n-border-hover: 2px solid var(--color-ink);
  --n-border-pressed: 2px solid var(--color-ink);
  --n-border-focus: 2px solid var(--color-ink);
  --n-box-shadow-focus: 3px 3px 0 var(--color-ink);
  --n-font-size: 14px;
  --n-font-weight: 700;
  box-shadow: var(--shadow-ink-sm);
}

.lg-ft {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--color-line);
  font-size: 12px;
  color: var(--color-faint);
}

.lg-ft a:hover {
  color: var(--color-accent-dark);
}

.rpm {
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
}

/* 背景彩胶：两层同心圆环 + 中心纸标签，纯 CSS */
.lg-disc {
  position: absolute;
  right: -90px;
  top: 50%;
  width: 310px;
  height: 310px;
  transform: translateY(-50%) rotate(14deg);
  border-radius: 50%;
  background:
    radial-gradient(circle, var(--color-paper) 0 17%, transparent 17%),
    repeating-radial-gradient(
      circle,
      var(--color-ink) 0 1px,
      var(--color-v4) 1px 5px,
      var(--color-v4) 5px 9px
    );
  border: 1.4px solid var(--color-ink);
  filter: drop-shadow(0 12px 20px rgb(35 36 40 / 18%));
  z-index: 1;
}

@media (max-width: 900px) {
  .lg-disc {
    display: none;
  }
}
</style>
