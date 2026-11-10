/**
 * `useAsyncData`：把"读数据"收敛成一个可预渲染的原语。
 *
 * 预渲染兼容纪律（票 10 的前提）：
 * 1. 请求在 **setup 阶段**发起，不在 `onMounted` —— 预渲染不会挂载组件，挂在 `onMounted` 的请求
 *    在构建期永远不会跑，产出的 HTML 就是空壳。
 * 2. 同时注册 `onServerPrefetch(load)`：预渲染器会等这个 promise 落地再序列化 HTML，
 *    因此首屏拿到的是真实内容。水合时 store 已有同一份数据，`load()` 立即返回，不会二次请求。
 * 3. 同一 `key` 的多个消费者共享同一组 ref 与同一个 in-flight promise，
 *    避免"同一页两个组件各发一次请求"。
 */
import { onServerPrefetch, onScopeDispose, shallowRef, type ShallowRef } from 'vue';

/** 一次异步读取的状态。 */
export interface AsyncData<T> {
  /** 数据；未就绪时为 `null`。 */
  readonly data: ShallowRef<T | null>;
  /** 失败原因；成功时为 `null`。区分 404 请用 `error.status`。 */
  readonly error: ShallowRef<Error | null>;
  /** 是否在请求中。 */
  readonly pending: ShallowRef<boolean>;
  /** 手动重试。 */
  readonly reload: () => Promise<void>;
}

/** 按 key 共享的条目。 */
interface Entry {
  readonly data: ShallowRef<unknown | null>;
  readonly error: ShallowRef<Error | null>;
  readonly pending: ShallowRef<boolean>;
  inFlight: Promise<void> | null;
  consumers: number;
}

/** 进程内共享表：同一 key 只保留一份状态。 */
const entries = new Map<string, Entry>();

/**
 * 声明一份异步数据。
 *
 * @param key 稳定标识（同一 key 的调用方共享状态）。
 * @param load 实际加载函数，通常来自 Pinia store 的 `load*`（store 负责缓存）。
 * @returns 数据 / 错误 / 加载中状态与重试函数。
 */
export function useAsyncData<T>(key: string, load: () => Promise<T>): AsyncData<T> {
  let entry = entries.get(key);
  if (entry === undefined) {
    entry = {
      data: shallowRef<unknown | null>(null),
      error: shallowRef<Error | null>(null),
      pending: shallowRef(false),
      inFlight: null,
      consumers: 0,
    };
    entries.set(key, entry);
  }

  const current = entry;
  current.consumers += 1;

  const run = (): Promise<void> => {
    if (current.inFlight !== null) {
      return current.inFlight;
    }
    current.pending.value = true;
    current.inFlight = (async () => {
      try {
        current.data.value = await load();
        current.error.value = null;
      } catch (error) {
        current.data.value = null;
        current.error.value = error instanceof Error ? error : new Error(String(error));
      } finally {
        current.pending.value = false;
        current.inFlight = null;
      }
    })();
    return current.inFlight;
  };

  // 1) setup 阶段即发起：预渲染与水合都走这一条路。
  void run();

  // 2) 预渲染器等待它完成后再输出 HTML（客户端是 no-op）。
  onServerPrefetch(run);

  // 3) 组件销毁时递减引用计数，没人再用了就把条目丢掉，避免无限增长。
  onScopeDispose(() => {
    current.consumers -= 1;
    if (current.consumers <= 0) {
      entries.delete(key);
    }
  });

  return {
    data: current.data as ShallowRef<T | null>,
    error: current.error,
    pending: current.pending,
    reload: run,
  };
}
