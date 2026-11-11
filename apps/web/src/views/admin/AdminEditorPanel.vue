<script setup lang="ts">
/**
 * 编辑器主体（设计稿 10 屏）：元信息在上，Markdown 源码与预览并排。
 *
 * `useMessage()` / `useDialog()` 只能注入**祖先**组件提供的 provider，
 * 而 provider 必须挂在 `/admin` 子树里（不能进前台入口 chunk）。
 * 所以本组件只写业务，`NConfigProvider` / `NMessageProvider` / `NDialogProvider`
 * 由外壳 `AdminEditorView.vue`（同目录）包在它外面。
 *
 * 四个不能省的机制，都写在这里而不是留给"以后再说"：
 *
 * 1. **预览与前台同一条管线**：预览调用的是共享包的 `renderMarkdown()`，
 *    容器用的也是 `.prose`（详情页那套排版）。如果预览自己写一套简版渲染，
 *    作者看到的和读者看到的就会不一致——那这个预览等于没有。
 * 2. **乐观锁**：保存永远带 `expectedUpdatedAt`。409 `STALE_WRITE` 不是"重试一下"，
 *    而是"另一个人改了"，必须让作者选：拉取最新，或强制覆盖（覆盖前先取最新时间戳，
 *    否则第二次 PUT 依然会 409）。
 * 3. **防丢失**：`beforeunload` + 站内路由守卫 + 每 30 秒静默存草稿。
 *    三条都要，因为"关标签页""点站内链接""系统崩了"是三种不同的丢法。
 * 4. **图片即上传**：粘贴与拖拽都直接传，先插占位符保证正文顺序不被打乱，
 *    失败就把占位符换成一行错误提示，而不是悄悄吞掉。
 */
import {
  NButton,
  NInput,
  NModal,
  NSelect,
  useDialog,
  useMessage,
} from 'naive-ui';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import {
  POST_SLUG_PATTERN,
  POST_STATUS,
  renderMarkdown,
  type PostInput,
  type PostStatus,
  type TagRef,
} from '@tiny-blogs/shared';
import {
  createAdminPost,
  getAdminPost,
  listAdminTags,
  publishAdminPost,
  unpublishAdminPost,
  updateAdminPost,
  uploadImage,
} from '../../api/admin';
import { ApiRequestError } from '../../api/client';
import { formatTime } from '../../lib/format';
import { sanitizeSlug, slugify } from '../../lib/slug';
import { useContentStore } from '../../stores/content';

/** 自动保存间隔（毫秒）。 */
const AUTOSAVE_MS = 30_000;

/** 预览防抖（毫秒）。 */
const PREVIEW_DEBOUNCE_MS = 300;

/** 摘要建议长度。 */
const SUMMARY_HINT = { min: 40, max: 120 } as const;

const route = useRoute();
const router = useRouter();
const content = useContentStore();
const message = useMessage();
const dialog = useDialog();

/** 表单模型。 */
const form = reactive({
  title: '',
  slug: '',
  summary: '',
  contentMd: '',
  tagSlugs: [] as string[],
});

/** 当前文章 slug（新建时为 `null`）。 */
const slug = ref<string | null>(null);

/** 乐观锁基准：服务端最后一次已知的 `updatedAt`。 */
const expectedUpdatedAt = ref<string | null>(null);

/** 文章状态。 */
const status = ref<PostStatus>(POST_STATUS.draft);

/** 最后一次成功保存的时间（ISO）。 */
const lastSavedAt = ref<string | null>(null);

/** 保存中 / 发布中。 */
const saving = ref(false);
const publishing = ref(false);

/** 已保存内容的快照：与当前表单比较得出"是否有改动"。 */
const baseline = ref('');

/** 用户是否手动改过 slug（改过就不再自动建议）。 */
const slugTouched = ref(false);

/** 自动保存失败提示（顶栏小字）。 */
const autosaveFailed = ref(false);

/** 冲突弹层开关。 */
const conflictOpen = ref(false);

/** 是否正在由本组件主动跳转（用于放行路由守卫）。 */
const selfNavigating = ref(false);

/** 标签下拉的选项。 */
const tagOptions = ref<{ label: string; value: string }[]>([]);

/** 正文 textarea（插入图片时要读光标位置）。 */
const sourceEl = ref<HTMLTextAreaElement | null>(null);

/** 隐藏的文件选择框。 */
const filePickerEl = ref<HTMLInputElement | null>(null);

/** 预览 HTML。 */
const previewHtml = ref('');

/** 预览里的阅读时长（与前台用同一个函数算）。 */
const previewMinutes = ref(1);

/** 预览防抖计时器。 */
let previewTimer: ReturnType<typeof setTimeout> | null = null;

/** 自动保存计时器。 */
let autosaveTimer: ReturnType<typeof setInterval> | null = null;

/** 上传占位符的自增 id。 */
let uploadSeq = 0;

/** 是否新建。 */
const isNew = computed(() => slug.value === null);

/** 是否已发布。 */
const isPublished = computed(() => status.value === POST_STATUS.published);

/** 是否有未保存的改动。 */
const dirty = computed(() => serialize() !== baseline.value);

/** 当前内容的字数（去掉首尾空白后的字符数，仅作展示）。 */
const charCount = computed(() => form.contentMd.trim().length);

/** 摘要字数的提示色（低于/超出建议区间时变灰提示，不阻止保存）。 */
const summaryLength = computed(() => form.summary.trim().length);

/** 顶栏的保存状态文案。 */
const saveLabel = computed(() => {
  if (saving.value) {
    return 'SAVING…';
  }
  if (autosaveFailed.value) {
    return '自动保存失败';
  }
  if (lastSavedAt.value === null) {
    return dirty.value ? 'UNSAVED' : '—';
  }
  return `SAVED ${formatTime(lastSavedAt.value)}`;
});

/**
 * 把表单压成可比较的字符串（用于脏检查）。
 *
 * @returns 稳定的序列化结果。
 */
function serialize(): string {
  return JSON.stringify({
    title: form.title,
    slug: form.slug,
    summary: form.summary,
    contentMd: form.contentMd,
    tagSlugs: form.tagSlugs,
  });
}

/**
 * 把异常翻译成一句人话。
 *
 * @param error 捕获到的异常。
 * @param fallback 兜底文案。
 * @returns 展示用文案。
 */
function describe(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/** 重算预览（防抖）。 */
function schedulePreview(): void {
  if (previewTimer !== null) {
    clearTimeout(previewTimer);
  }
  previewTimer = setTimeout(() => {
    const rendered = renderMarkdown(form.contentMd);
    previewHtml.value = rendered.html;
    previewMinutes.value = rendered.readingMinutes;
  }, PREVIEW_DEBOUNCE_MS);
}

/** 摘要长度提示。 */
const summaryHint = computed(() => {
  const length = summaryLength.value;
  if (length === 0) {
    return `建议 ${String(SUMMARY_HINT.min)}–${String(SUMMARY_HINT.max)} 字`;
  }
  if (length < SUMMARY_HINT.min) {
    return `${String(length)} 字，再补一点到 ${String(SUMMARY_HINT.min)} 字以上`;
  }
  if (length > SUMMARY_HINT.max) {
    return `${String(length)} 字，超出建议的 ${String(SUMMARY_HINT.max)} 字`;
  }
  return `${String(length)} 字，长度合适`;
});

/** 前端最小校验（正确性仍以服务端为准）。 */
function validate(): string | null {
  if (form.title.trim() === '') {
    return '标题不能为空';
  }
  if (form.title.trim().length > 120) {
    return '标题最长 120 个字';
  }
  const slugValue = form.slug.trim();
  if (slugValue === '') {
    return 'slug 不能为空（可点右侧"从标题生成"）';
  }
  if (!POST_SLUG_PATTERN.test(slugValue)) {
    return 'slug 只能用小写字母、数字与连字符';
  }
  if (form.summary.trim() === '') {
    return '摘要不能为空';
  }
  if (form.summary.trim().length > 200) {
    return '摘要最长 200 个字';
  }
  return null;
}

/** 组装写侧入参。 */
function buildInput(): PostInput {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    summary: form.summary.trim(),
    contentMd: form.contentMd,
    tagSlugs: [...form.tagSlugs],
  };
}

/**
 * 保存（新建或更新）。
 *
 * @param silent 静默模式（自动保存用：失败只顶栏提示，不弹 toast）。
 * @returns 成功为 `true`。
 */
async function save(silent = false): Promise<boolean> {
  if (saving.value) {
    return false;
  }

  const problem = validate();
  if (problem !== null) {
    if (!silent) {
      message.error(problem);
    }
    return false;
  }

  saving.value = true;
  autosaveFailed.value = false;
  try {
    if (isNew.value) {
      const record = await createAdminPost(buildInput());
      slug.value = record.slug;
      expectedUpdatedAt.value = record.updatedAt;
      status.value = record.status;
      lastSavedAt.value = record.updatedAt;
      baseline.value = serialize();
      content.invalidate();
      // 新建完成后把地址换成编辑态：刷新页面不会又变成一张空表单。
      selfNavigating.value = true;
      await router.replace({ name: 'admin-post-edit', params: { slug: record.slug } });
      if (!silent) {
        message.success('已存为草稿');
      }
      return true;
    }

    const record = await updateAdminPost(slug.value as string, {
      ...buildInput(),
      expectedUpdatedAt: expectedUpdatedAt.value ?? '',
    });
    expectedUpdatedAt.value = record.updatedAt;
    status.value = record.status;
    lastSavedAt.value = record.updatedAt;
    baseline.value = serialize();
    content.invalidate();
    if (!silent) {
      message.success('已保存');
    }
    return true;
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'STALE_WRITE') {
      conflictOpen.value = true;
      return false;
    }
    if (error instanceof ApiRequestError && error.code === 'SLUG_TAKEN') {
      message.error('这个 slug 已被别的文章占用，换一个');
      return false;
    }
    if (silent) {
      autosaveFailed.value = true;
    } else {
      message.error(describe(error, '保存失败'));
    }
    return false;
  } finally {
    saving.value = false;
  }
}

/** 发布前确认（固定文案：发布不等于上线）。 */
function confirmPublish(): void {
  if (isPublished.value) {
    return;
  }
  dialog.warning({
    title: '发布文章',
    content: '发布后需触发全量重建才会上线。确定现在发布？',
    positiveText: '发布',
    negativeText: '取消',
    onPositiveClick: async () => {
      await publish();
    },
  });
}

/** 发布：先把内容存好，再发布（否则会把旧内容发出去）。 */
async function publish(): Promise<void> {
  if (publishing.value) {
    return;
  }
  if (dirty.value || isNew.value) {
    const saved = await save();
    if (!saved) {
      return;
    }
  }
  if (slug.value === null) {
    return;
  }

  publishing.value = true;
  try {
    const record = await publishAdminPost(slug.value);
    status.value = record.status;
    expectedUpdatedAt.value = record.updatedAt;
    lastSavedAt.value = record.updatedAt;
    content.invalidate();
    message.success('已发布，需触发全量重建后对外可见');
  } catch (error) {
    message.error(describe(error, '发布失败'));
  } finally {
    publishing.value = false;
  }
}

/** 取消发布。 */
async function unpublish(): Promise<void> {
  if (publishing.value || slug.value === null) {
    return;
  }
  publishing.value = true;
  try {
    const record = await unpublishAdminPost(slug.value);
    status.value = record.status;
    expectedUpdatedAt.value = record.updatedAt;
    lastSavedAt.value = record.updatedAt;
    content.invalidate();
    message.success('已取消发布，转回草稿');
  } catch (error) {
    message.error(describe(error, '操作失败'));
  } finally {
    publishing.value = false;
  }
}

/** 冲突处理：拉取最新（放弃本地改动）。 */
async function pullLatest(): Promise<void> {
  if (slug.value === null) {
    return;
  }
  try {
    const detail = await getAdminPost(slug.value);
    applyDetail(
      detail.title,
      detail.slug,
      detail.summary,
      detail.contentMd,
      detail.tags.map((tag) => tag.slug),
      detail.updatedAt,
      detail.status,
    );
    message.success('已拉取最新版本');
  } catch (error) {
    message.error(describe(error, '拉取失败'));
  } finally {
    conflictOpen.value = false;
  }
}

/** 冲突处理：强制覆盖（先取最新时间戳，再用它作为乐观锁基准重存）。 */
async function forceOverwrite(): Promise<void> {
  if (slug.value === null) {
    return;
  }
  try {
    const detail = await getAdminPost(slug.value);
    expectedUpdatedAt.value = detail.updatedAt;
    conflictOpen.value = false;
    await save();
  } catch (error) {
    conflictOpen.value = false;
    message.error(describe(error, '覆盖失败'));
  }
}

/**
 * 把服务端详情灌进表单。
 *
 * @param nextTitle 标题。
 * @param nextSlug slug。
 * @param nextSummary 摘要。
 * @param nextContent 正文。
 * @param nextTags 标签 slug 列表。
 * @param nextUpdatedAt 更新时间（乐观锁基准）。
 * @param nextStatus 状态。
 */
function applyDetail(
  nextTitle: string,
  nextSlug: string,
  nextSummary: string,
  nextContent: string,
  nextTags: readonly string[],
  nextUpdatedAt: string,
  nextStatus: PostStatus,
): void {
  form.title = nextTitle;
  form.slug = nextSlug;
  form.summary = nextSummary;
  form.contentMd = nextContent;
  form.tagSlugs = [...nextTags];
  slug.value = nextSlug;
  expectedUpdatedAt.value = nextUpdatedAt;
  status.value = nextStatus;
  lastSavedAt.value = nextUpdatedAt;
  baseline.value = serialize();
  autosaveFailed.value = false;
  schedulePreview();
}

/** 从标题生成 slug（用户没手动改过 slug 时也自动跟随）。 */
function suggestSlug(): void {
  const suggestion = slugify(form.title);
  if (suggestion === '') {
    message.warning('标题里没有可用的拉丁字母，请手填 slug');
    return;
  }
  form.slug = suggestion;
  slugTouched.value = true;
}

/**
 * 在光标处插入文本。
 *
 * @param text 要插入的文本。
 */
async function insertAtCursor(text: string): Promise<void> {
  const element = sourceEl.value;
  const start = element?.selectionStart ?? form.contentMd.length;
  const end = element?.selectionEnd ?? start;
  form.contentMd = `${form.contentMd.slice(0, start)}${text}${form.contentMd.slice(end)}`;
  await nextTick();
  const caret = start + text.length;
  element?.focus();
  element?.setSelectionRange(caret, caret);
}

/**
 * 上传一组图片：先插占位符，成功后替换成 `![alt](url)`，失败替换成错误提示行。
 *
 * @param files 待上传的图片。
 */
async function uploadFiles(files: readonly File[]): Promise<void> {
  for (const file of files) {
    uploadSeq += 1;
    const marker = `\u0000upload-${String(uploadSeq)}\u0000`;
    await insertAtCursor(`![上传中…](${marker})\n`);

    try {
      const result = await uploadImage(file);
      const alt = file.name.replace(/\.[^.]+$/, '');
      form.contentMd = form.contentMd.replace(
        `![上传中…](${marker})`,
        `![${alt}](${result.url})`,
      );
    } catch (error) {
      const reason = error instanceof ApiRequestError ? error.message : '上传失败';
      form.contentMd = form.contentMd.replace(
        `![上传中…](${marker})`,
        `> ⚠️ 图片上传失败（${file.name}）：${reason}`,
      );
    }
  }
}

/** 粘贴：把剪贴板里的图片当附件上传，文本粘贴照常。 */
function onPaste(event: ClipboardEvent): void {
  const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
    file.type.startsWith('image/'),
  );
  if (files.length === 0) {
    return;
  }
  event.preventDefault();
  void uploadFiles(files);
}

/** 拖拽：只在真的拖入图片时接管（否则不干扰文本拖放）。 */
function onDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
    file.type.startsWith('image/'),
  );
  if (files.length === 0) {
    return;
  }
  event.preventDefault();
  void uploadFiles(files);
}

/** 工具栏"插入图片"：走系统文件选择器。 */
function pickImage(): void {
  filePickerEl.value?.click();
}

/** 文件选择器的 change 处理。 */
function onPickImage(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  void uploadFiles(files);
}

/** 键盘快捷键：⌘S / Ctrl+S 存草稿，⌘Enter / Ctrl+Enter 发布。 */
function onKeydown(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey)) {
    return;
  }
  if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    confirmPublish();
  }
}

/** 关闭/刷新提醒（只在有未保存改动时）。 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) {
    return;
  }
  event.preventDefault();
  event.returnValue = '';
}

// 标题变化时，若用户还没手动改过 slug，就自动带出一个建议值。
watch(
  () => form.title,
  (value) => {
    if (slugTouched.value || form.slug !== '') {
      return;
    }
    const suggestion = slugify(value);
    if (suggestion !== '') {
      form.slug = suggestion;
    }
  },
);

// slug 输入实时擦干净（用户可能粘进整条 URL）。
watch(
  () => form.slug,
  (value) => {
    const clean = sanitizeSlug(value);
    if (clean !== value) {
      form.slug = clean;
    }
  },
);

// 正文变化 → 重新排一次预览。
watch(
  () => form.contentMd,
  () => {
    schedulePreview();
  },
);

/** 站内跳转守卫：有改动时先问一句。 */
onBeforeRouteLeave(async () => {
  if (selfNavigating.value || !dirty.value) {
    return true;
  }
  const leave = await new Promise<boolean>((resolve) => {
    dialog.warning({
      title: '离开编辑器？',
      content: '有未保存的改动，离开后会丢失。',
      positiveText: '仍然离开',
      negativeText: '留下继续写',
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => resolve(false),
    });
  });
  return leave;
});

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);

  try {
    const tags = await listAdminTags();
    tagOptions.value = tags.map((tag: TagRef) => ({ label: tag.name, value: tag.slug }));
  } catch {
    // 标签拉不到不该挡住写作；下拉为空即可，仍可手输。
  }

  const routeSlug = typeof route.params.slug === 'string' ? route.params.slug : null;
  if (routeSlug === null) {
    baseline.value = serialize();
    schedulePreview();
  } else {
    try {
      const detail = await getAdminPost(routeSlug);
      applyDetail(
        detail.title,
        detail.slug,
        detail.summary,
        detail.contentMd,
        detail.tags.map((tag) => tag.slug),
        detail.updatedAt,
        detail.status,
      );
    } catch (error) {
      message.error(describe(error, '文章加载失败'));
      selfNavigating.value = true;
      await router.replace({ name: 'admin-posts' });
      return;
    }
  }

  // 每 30 秒静默存一次草稿：只对"已有 slug 且确有改动"的文章生效，
  // 新建但还没填 slug 时无处可存（服务端不允许无 slug 的文章）。
  autosaveTimer = setInterval(() => {
    if (!dirty.value || saving.value || slug.value === null) {
      return;
    }
    void save(true);
  }, AUTOSAVE_MS);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
  if (previewTimer !== null) {
    clearTimeout(previewTimer);
  }
  if (autosaveTimer !== null) {
    clearInterval(autosaveTimer);
  }
});

</script>

<template>
  <div class="ed">
          <div class="ed-top">
            <RouterLink class="back" :to="{ name: 'admin-posts' }">← 返回列表</RouterLink>
            <input
              v-model="form.title"
              class="ed-title"
              aria-label="文章标题"
              placeholder="文章标题"
              maxlength="120"
            />
            <div class="ed-act">
              <span class="save" :class="{ warn: autosaveFailed }">{{ saveLabel }}</span>
              <NButton size="small" :loading="saving" @click="save()">存草稿</NButton>
              <NButton
                v-if="!isPublished"
                size="small"
                type="primary"
                :loading="publishing"
                @click="confirmPublish"
              >
                发布
              </NButton>
              <NButton v-else size="small" :loading="publishing" @click="unpublish">取消发布</NButton>
            </div>
          </div>

          <p class="ed-notice">发布后需触发全量重建才会上线（约一分钟）；构建失败时线上保留上一版。</p>

          <div class="ed-meta">
            <div class="n-field">
              <label for="ed-tags">标签</label>
              <NSelect
                id="ed-tags"
                v-model:value="form.tagSlugs"
                multiple
                filterable
                tag
                :options="tagOptions"
                placeholder="回车添加，Backspace 删末个"
              />
            </div>

            <div class="n-field">
              <label for="ed-slug">slug</label>
              <div class="slug-row">
                <NInput id="ed-slug" v-model:value="form.slug" class="mono" placeholder="vite-ssg-prerender" />
                <NButton size="small" @click="suggestSlug">从标题生成</NButton>
              </div>
              <p class="hint">
                地址：<code>/posts/{{ form.slug === '' ? '…' : form.slug }}</code>
                <span v-if="isNew"> · 新建时留空可自动建议</span>
              </p>
            </div>

            <div class="n-field full">
              <label for="ed-summary">摘要</label>
              <NInput
                id="ed-summary"
                v-model:value="form.summary"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                placeholder="一句话说清这篇在解决什么问题"
                maxlength="200"
              />
              <p class="hint">{{ summaryHint }}</p>
            </div>
          </div>

          <div class="ed-split">
            <div class="ed-src">
              <div class="ed-toolbar">
                <button type="button" @click="pickImage">＋ 插入图片</button>
                <span class="tb-hint">也可直接粘贴或拖入图片</span>
                <input
                  ref="filePickerEl"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  multiple
                  hidden
                  @change="onPickImage"
                />
              </div>
              <textarea
                ref="sourceEl"
                v-model="form.contentMd"
                class="src"
                spellcheck="false"
                placeholder="## 小标题&#10;&#10;正文用 Markdown 写。图片可以直接粘贴。"
                @paste="onPaste"
                @drop="onDrop"
                @dragover.prevent
              />
            </div>

            <div class="ed-out">
              <div class="prose-wrap">
                <div v-if="form.contentMd.trim() === ''" class="out-empty">预览会出现在这里。</div>
                <!-- 与详情页同一个渲染器、同一套 `.prose` 排版 -->
                <div v-else class="prose" v-html="previewHtml" />
              </div>
            </div>
          </div>

          <div class="ed-ft">
            <span>{{ charCount }} 字</span>
            <span>{{ previewMinutes }} MIN</span>
            <span>MARKDOWN</span>
            <span class="sp">发布后触发一次全量重建</span>
          </div>
        </div>

        <NModal
          v-model:show="conflictOpen"
          preset="card"
          title="这篇文章在别处被改过了"
          class="conflict"
          :mask-closable="false"
          :closable="false"
        >
          <p>
            服务端记录的更新时间已经变了（另一窗口或另一台设备保存过）。为避免覆盖别人的改动，
            请选择：拉取最新版本（你的本地改动会丢），或强制用当前内容覆盖。
          </p>
          <template #footer>
            <div class="conflict-act">
              <NButton @click="pullLatest">拉取最新</NButton>
              <NButton type="primary" @click="forceOverwrite">强制覆盖</NButton>
            </div>
          </template>
    </NModal>
</template>

<style scoped>
.ed {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 78px);
  background: var(--color-bg);
}

.ed-top {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 58px;
  padding: 0 28px;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-paper);
}

.back {
  font-size: 12.5px;
  color: var(--color-faint);
  white-space: nowrap;
}

.back:hover {
  color: var(--color-ink);
}

.ed-title {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  outline: 0;
}

.ed-act {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.save {
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.1em;
}

.save.warn {
  color: var(--color-accent-dark);
}

.ed-notice {
  margin: 0;
  padding: 7px 28px;
  border-bottom: 1px solid var(--color-line);
  background: color-mix(in srgb, var(--color-mark) 34%, var(--color-paper));
  color: var(--color-body);
  font-size: 11.5px;
}

.ed-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;
  padding: 20px 28px;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-bg);
}

.ed-meta .full {
  grid-column: 1 / -1;
}

.n-field > label {
  display: block;
  margin-bottom: 7px;
  color: var(--color-dim);
  font-size: 11.5px;
}

.slug-row {
  display: flex;
  gap: 8px;
}

.mono {
  --n-font-family: var(--font-mono);
  --n-font-size: 12.5px;
}

.hint {
  margin: 6px 0 0;
  color: var(--color-faint);
  font-size: 11px;
}

.hint code {
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.ed-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  min-height: 300px;
}

.ed-src {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--color-line);
  background: color-mix(in srgb, var(--color-bg) 70%, var(--color-paper));
}

.ed-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 26px;
  border-bottom: 1px solid var(--color-line);
}

.ed-toolbar button {
  padding: 4px 10px;
  border: 1px solid var(--color-line2);
  border-radius: 4px;
  background: var(--color-paper);
  color: var(--color-dim);
  font-size: 11.5px;
  cursor: pointer;
}

.ed-toolbar button:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-dark);
}

.tb-hint {
  color: var(--color-faint);
  font-size: 10.5px;
}

.src {
  flex: 1;
  min-height: 260px;
  padding: 16px 26px;
  border: 0;
  background: transparent;
  color: var(--color-body);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 2;
  resize: none;
  outline: 0;
  white-space: pre-wrap;
}

.ed-out {
  min-width: 0;
  padding: 18px 26px;
  background: var(--color-paper);
}

.prose-wrap {
  max-width: 100%;
  overflow-x: auto;
}

.out-empty {
  color: var(--color-faint);
  font-size: 12.5px;
}

.ed-ft {
  display: flex;
  gap: 18px;
  align-items: baseline;
  padding: 11px 28px;
  border-top: 1px solid var(--color-line);
  background: var(--color-paper);
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.ed-ft .sp {
  margin-left: auto;
}

.conflict {
  width: min(520px, calc(100vw - 32px));
}

.conflict-act {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 980px) {
  .ed-split {
    grid-template-columns: 1fr;
  }

  .ed-meta {
    grid-template-columns: 1fr;
  }

  .ed-src {
    border-right: 0;
    border-bottom: 1px solid var(--color-line);
  }
}
</style>
