/**
 * 本地卷适配器：把上传文件落到 `UPLOAD_DIR`（默认 `./var/uploads`，已被 .gitignore 忽略）。
 *
 * 目录结构就是 key 的目录结构（`2026/11/ab12cd34.png`），因此静态服务可以直接
 * 用 `express.static` 指到根目录，不需要任何映射表。
 */
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { BaseStorage } from './storage.service';

/** `LocalDiskStorage` 的构造参数。 */
export interface LocalDiskStorageOptions {
  /** 根目录（相对路径按进程工作目录解析）。 */
  readonly dir: string;
  /** 单文件字节上限。 */
  readonly maxBytes: number;
  /** 取当前时间；默认 `() => new Date()`。 */
  readonly now?: () => Date;
}

/** 本地卷存储。 */
export class LocalDiskStorage extends BaseStorage {
  /** 已解析成绝对路径的根目录。 */
  private readonly root: string;

  /**
   * @param options 根目录、上限与时钟。
   */
  constructor(options: LocalDiskStorageOptions) {
    super(options.maxBytes, options.now ?? (() => new Date()));
    this.root = resolve(options.dir);
  }

  /** 根目录的绝对路径（供静态服务与测试断言使用）。 */
  get rootDir(): string {
    return this.root;
  }

  /**
   * 把 absolute key 解析成绝对路径，并确认没有越出根目录。
   *
   * @param key 已校验的存储键。
   * @returns 绝对路径。
   */
  private absolutePath(key: string): string {
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      // 双保险：即使 key 校验被绕过，也不会写到根目录之外。
      throw new Error(`拒绝写入根目录之外的路径：${key}`);
    }
    return target;
  }

  /**
   * 写入文件；已存在（内容相同）时直接跳过，实现按内容去重。
   *
   * @param key 已校验的存储键。
   * @param buffer 文件内容。
   */
  protected async write(key: string, buffer: Buffer): Promise<void> {
    const target = this.absolutePath(key);

    const existing = await stat(target).catch(() => null);
    if (existing !== null && existing.size === buffer.byteLength) {
      // key 是内容哈希，同名同大小即同一份文件：重复上传不重复落盘。
      return;
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
  }

  /**
   * 删除文件（不存在视为成功）。
   *
   * @param key 已校验的存储键。
   */
  protected async delete(key: string): Promise<void> {
    await rm(this.absolutePath(key), { force: true });
  }
}
