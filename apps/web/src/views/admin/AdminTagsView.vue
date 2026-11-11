<script setup lang="ts">
/**
 * 标签管理（设计稿 09 屏侧栏的第二项）。
 *
 * 票面带"可选"，但没有这一页，侧栏的「标签」就只能是个死链；
 * 后端 CRUD 已经齐了（票 04），这里只是把它接出来。
 *
 * 交互上只做一件事的取舍：**重名不拦在前端**。
 * 名与 slug 两列都有唯一索引，前端判断"看起来重了"很容易误伤
 * （比如 `Vue` 与 `vue` 在 MySQL 的排序规则下就是同一个），
 * 直接让服务端的 409 说话，文案里带着冲突的名字，比猜更准。
 */
import { NButton, NInput, useDialog, useMessage } from 'naive-ui';
import { onMounted, reactive, ref } from 'vue';
import type { TagRef } from '@tiny-blogs/shared';
import {
  createAdminTag,
  deleteAdminTag,
  listAdminTags,
  updateAdminTag,
} from '../../api/admin';
import { ApiRequestError } from '../../api/client';
import { useContentStore } from '../../stores/content';

const message = useMessage();
const dialog = useDialog();
const content = useContentStore();

/** 全部标签。 */
const tags = ref<readonly TagRef[]>([]);

/** 列表加载中。 */
const loading = ref(false);

/** 新建表单。 */
const draft = reactive({ name: '', slug: '' });

/** 正在编辑的行（`null` 表示没有）。 */
const editing = ref<{ slug: string; name: string; slugValue: string } | null>(null);

/** 写操作进行中。 */
const busy = ref(false);

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

/** 拉标签列表。 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    tags.value = await listAdminTags();
  } catch (error) {
    message.error(describe(error, '标签加载失败'));
  } finally {
    loading.value = false;
  }
}

/** 新建标签。 */
async function create(): Promise<void> {
  if (busy.value) {
    return;
  }
  const name = draft.name.trim();
  const slug = draft.slug.trim();
  if (name === '' || slug === '') {
    message.warning('名称与 slug 都要填');
    return;
  }
  busy.value = true;
  try {
    await createAdminTag({ name, slug });
    draft.name = '';
    draft.slug = '';
    content.invalidate();
    await load();
    message.success('已新建标签');
  } catch (error) {
    message.error(describe(error, '新建失败'));
  } finally {
    busy.value = false;
  }
}

/** 进入行内编辑。 */
function startEdit(tag: TagRef): void {
  editing.value = { slug: tag.slug, name: tag.name, slugValue: tag.slug };
}

/** 取消行内编辑。 */
function cancelEdit(): void {
  editing.value = null;
}

/** 保存行内编辑。 */
async function commitEdit(): Promise<void> {
  const current = editing.value;
  if (current === null || busy.value) {
    return;
  }
  const name = current.name.trim();
  const slug = current.slugValue.trim();
  if (name === '' || slug === '') {
    message.warning('名称与 slug 都要填');
    return;
  }
  busy.value = true;
  try {
    await updateAdminTag(current.slug, { name, slug });
    editing.value = null;
    content.invalidate();
    await load();
    message.success('已保存');
  } catch (error) {
    message.error(describe(error, '保存失败'));
  } finally {
    busy.value = false;
  }
}

/**
 * 删除标签（二次确认；文章本身不受影响，只解除关联）。
 *
 * @param tag 目标标签。
 */
function confirmRemove(tag: TagRef): void {
  dialog.warning({
    title: '删除标签',
    content: `删除「${tag.name}」后，挂着它的文章会失去这个标签（文章本身不受影响）。确定删除？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      busy.value = true;
      try {
        await deleteAdminTag(tag.slug);
        content.invalidate();
        await load();
        message.success('已删除');
      } catch (error) {
        message.error(describe(error, '删除失败'));
      } finally {
        busy.value = false;
      }
    },
  });
}

onMounted(load);
</script>

<template>
  <div class="adm-tags">
    <div class="bar">
      <NInput v-model:value="draft.name" placeholder="标签名，如 Vue" class="w-name" @keydown.enter="create" />
      <NInput
        v-model:value="draft.slug"
        placeholder="slug，如 vue"
        class="w-slug"
        @keydown.enter="create"
      />
      <NButton type="primary" :loading="busy" @click="create">＋ 新建标签</NButton>
      <span class="sp" />
      <span class="total">共 {{ tags.length }} 个</span>
    </div>

    <div class="n-card">
      <table class="n-table">
        <thead>
          <tr>
            <th class="c-name">名称</th>
            <th>slug</th>
            <th class="c-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tag in tags" :key="tag.slug" :class="{ busy: loading }">
            <td class="name">
              <template v-if="editing !== null && editing.slug === tag.slug">
                <NInput v-model:value="editing.name" size="small" @keydown.enter="commitEdit" />
              </template>
              <template v-else>{{ tag.name }}</template>
            </td>
            <td class="slug">
              <template v-if="editing !== null && editing.slug === tag.slug">
                <NInput v-model:value="editing.slugValue" size="small" @keydown.enter="commitEdit" />
              </template>
              <template v-else>{{ tag.slug }}</template>
            </td>
            <td class="act">
              <template v-if="editing !== null && editing.slug === tag.slug">
                <button type="button" :disabled="busy" @click="commitEdit">保存</button>
                <button type="button" :disabled="busy" @click="cancelEdit">取消</button>
              </template>
              <template v-else>
                <button type="button" :disabled="busy" @click="startEdit(tag)">改名</button>
                <button type="button" class="del" :disabled="busy" @click="confirmRemove(tag)">删除</button>
              </template>
            </td>
          </tr>
          <tr v-if="tags.length === 0 && !loading">
            <td colspan="3" class="empty">还没有标签。上面填好名称与 slug 就能建第一个。</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="adm-note">标签只在文章保存时建立关联；删除标签不会删文章。</p>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.w-name {
  width: 220px;
  --n-height: 34px;
}

.w-slug {
  width: 180px;
  --n-height: 34px;
}

.sp {
  margin-left: auto;
}

.total {
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 11px;
}

.n-card {
  margin-top: 16px;
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: 6px;
  overflow-x: auto;
}

.n-table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
  font-size: 13px;
}

.n-table th {
  padding: 11px 16px;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-bg);
  color: var(--color-faint);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-align: left;
  text-transform: uppercase;
}

.n-table td {
  padding: 11px 16px;
  border-bottom: 1px solid var(--color-line);
  color: var(--color-body);
}

.n-table tbody tr:last-child td {
  border-bottom: 0;
}

.c-name {
  width: 40%;
}

.c-act {
  text-align: right;
  width: 140px;
}

.name {
  color: var(--color-ink);
  font-weight: 500;
}

.slug {
  color: var(--color-dim);
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.act {
  text-align: right;
  white-space: nowrap;
}

.act button {
  margin-left: 12px;
  border: 0;
  background: none;
  color: var(--color-dim);
  font-size: 12.5px;
  cursor: pointer;
}

.act button:hover {
  color: var(--color-accent-dark);
}

.act button.del:hover {
  text-decoration: underline;
}

.act button:disabled {
  color: var(--color-faint);
  cursor: not-allowed;
}

.empty {
  padding: 30px 16px;
  color: var(--color-faint);
  font-size: 12.5px;
  text-align: center;
}

.adm-note {
  margin-top: 12px;
  color: var(--color-faint);
  font-size: 11.5px;
}
</style>
