/**
 * 内存适配器：与本地卷**同语义**，只把字节放在 Map 里。
 *
 * 用途有两个：
 * 1. 单元测试里验证校验逻辑（去重、超限、类型、删除），不碰磁盘；
 * 2. 将来若要做"上传即验证"的预演（例如构建期导图），可以临时替换掉落盘实现。
 *
 * 它暴露 `read()` 与容量计数，方便测试断言"同一份内容只存了一份"。
 */
import { BaseStorage, sniffImageMime } from './storage.service';

/** 一个已存储的对象。 */
export interface StoredObject {
  readonly mime: string;
  readonly bytes: Buffer;
}

/** 内存存储。 */
export class InMemoryStorage extends BaseStorage {
  /** key → 内容。 */
  private readonly objects = new Map<string, StoredObject>();

  /**
   * @param maxBytes 单文件字节上限（默认 5 MB，与生产默认值一致）。
   * @param now 取当前时间；默认 `() => new Date()`。
   */
  constructor(maxBytes = 5 * 1024 * 1024, now: () => Date = () => new Date()) {
    super(maxBytes, now);
  }

  /** 当前保存的对象个数（用于断言去重）。 */
  get size(): number {
    return this.objects.size;
  }

  /**
   * 读取内容（测试与预演用）。
   *
   * @param key 存储键。
   * @returns 内容；不存在时返回 `null`。
   */
  read(key: string): Buffer | null {
    return this.objects.get(key)?.bytes ?? null;
  }

  /**
   * @param key 已校验的存储键。
   * @param buffer 文件内容。
   */
  protected async write(key: string, buffer: Buffer): Promise<void> {
    if (this.objects.has(key)) {
      // 同一份内容重复上传：保留原有对象，不重复占用内存。
      return;
    }
    // 类型在 `buildKey` 里已经校验过，这里复用同一个嗅探函数只作记录，不另写一份判定。
    this.objects.set(key, {
      mime: sniffImageMime(buffer) ?? 'application/octet-stream',
      bytes: Buffer.from(buffer),
    });
  }

  /**
   * @param key 已校验的存储键。
   */
  protected async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
