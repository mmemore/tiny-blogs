/**
 * 滚动跟随：算出"当前读到哪一节"。
 *
 * 用于详情页目录与归档页的年份栏。用滚动位置而不是 IntersectionObserver：
 * 目录项与标题是 1:1 的，取"最后一个越过阈值线的标题"语义最直观，
 * 也不会在快速滚动时出现两个同时 active 的条目。
 *
 * 预渲染期直接返回 `null`（构建时没有滚动位置，也不需要高亮）。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/** 标题越过这条线（距视口顶部）就算"当前节"。与 `scroll-margin-top` 保持同一量级。 */
const ACTIVE_OFFSET = 140;

/**
 * 监听滚动，维护当前激活的锚点。
 *
 * @param getIds 返回当前可用的锚点 id 列表（顺序即文档顺序）。
 * @returns 当前激活的 id（预渲染期为 `null`）。
 */
export function useScrollSpy(getIds: () => readonly string[]): Ref<string | null> {
  const activeId = ref<string | null>(null);

  if (import.meta.env.SSR) {
    return activeId;
  }

  let ticking = false;

  const update = (): void => {
    ticking = false;
    const ids = getIds();
    let current: string | null = ids[0] ?? null;

    for (const id of ids) {
      const element = document.getElementById(id);
      if (element === null) {
        continue;
      }
      if (element.getBoundingClientRect().top - ACTIVE_OFFSET <= 0) {
        current = id;
      } else {
        break;
      }
    }

    activeId.value = current;
  };

  const onScroll = (): void => {
    if (ticking) {
      return;
    }
    ticking = true;
    window.requestAnimationFrame(update);
  };

  onMounted(() => {
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  });

  return activeId;
}
