/**
 * 存储层的契约与共用校验（契约 §4.5 `api/storage`）。
 *
 * 为什么把"嗅探 + 大小 + key"放进基类而不是各写一份：
 * 两个适配器（本地卷 / 内存）必须是**同语义**的——同一份字节进去，
 * 得到同样的 key、同样的拒绝理由。测试里用内存适配器跑业务逻辑、
 * 生产用本地卷，靠的就是这一层共享实现。
 */
import type { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import {
  UPLOAD_KEY_PATTERN,
  UPLOAD_MIME_EXTENSIONS,
  uploadUrlOf,
  type UploadMime,
  type UploadResult,
} from '@tiny-blogs/shared';
import { ApiError } from '../../common/errors/api-error';

/** 一次写入的输入。`content` 接受流或 Buffer（5MB 上限内的简单路径用 Buffer 更直接）。 */
export interface StorageInput {
  /** 文件内容。 */
  readonly content: Buffer | Readable;
  /** 客户端声明的 MIME（**不可信**，只用于日志；类型判定一律看字节）。 */
  readonly mime: string;
  /** 客户端声明的字节数（同样不可信，实际大小以读到的字节为准）。 */
  readonly size: number;
}

/** 存储适配器（契约 §4.5）。 */
export interface StorageService {
  /**
   * 写入一个文件。
   *
   * @param file 内容、声明的 mime 与大小。
   * @returns 存储键与可访问的站内 URL。
   * @throws {ApiError} 超过 `UPLOAD_MAX_BYTES` → 422 `FILE_TOO_LARGE`；类型不在白名单 → 422 `UNSUPPORTED_MEDIA_TYPE`。
   */
  put(file: StorageInput): Promise<UploadResult>;

  /**
   * 删除一个文件（不存在视为成功，便于重试）。
   *
   * @param key 存储键。
   * @throws {ApiError} key 形状不合法 → 422（挡住路径穿越）。
   */
  remove(key: string): Promise<void>;
}

/** 依赖注入令牌：业务代码只依赖 `StorageService`，不关心落盘还是落内存。 */
export const STORAGE = Symbol('TINY_BLOGS_STORAGE');

/** PNG 魔数。 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 按字节嗅探图片类型。
 *
 * 只认魔数，不认扩展名与 `Content-Type`：两者都由客户端决定，改一个字节就能骗过去。
 * 白名单里**没有 svg**——SVG 是可以内嵌脚本的 XML，作为可公开访问的静态资源
 * 会变成储存型 XSS 的入口，v1 直接不支持（报告里单独说明）。
 *
 * @param buffer 文件内容（至少 12 字节）。
 * @returns 识别到的 MIME；不是白名单内的图片则返回 `null`。
 */
export function sniffImageMime(buffer: Buffer): UploadMime | null {
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  // JPEG：FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF：`GIF87a` / `GIF89a`
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString('latin1') === 'GIF') {
    return 'image/gif';
  }
  // WebP：`RIFF....WEBP`
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * 把流读成 Buffer，超过上限立刻中止（不把整段脏数据读进内存）。
 *
 * @param content 流或 Buffer。
 * @param maxBytes 上限。
 * @returns 完整内容。
 * @throws {ApiError} 超过上限 → 422 `FILE_TOO_LARGE`。
 */
async function readAll(content: Buffer | Readable, maxBytes: number): Promise<Buffer> {
  if (Buffer.isBuffer(content)) {
    if (content.byteLength > maxBytes) {
      throw ApiError.fileTooLarge(maxBytes);
    }
    return content;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of content) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.byteLength;
    if (total > maxBytes) {
      // 主动销毁流，别让对方继续往内存里灌。
      content.destroy();
      throw ApiError.fileTooLarge(maxBytes);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

/**
 * 两个适配器的公共实现：读全量 → 校验大小 → 嗅探类型 → 由内容算出 key。
 */
export abstract class BaseStorage implements StorageService {
  protected constructor(
    protected readonly maxBytes: number,
    /** 取当前时间（测试可注入固定时钟，保证 key 里的年月可预期）。 */
    protected readonly now: () => Date,
  ) {}

  /**
   * @param file 上传内容。
   * @returns 存储键与站内 URL。
   */
  async put(file: StorageInput): Promise<UploadResult> {
    const buffer = await readAll(file.content, this.maxBytes);
    const key = this.buildKey(buffer);
    await this.write(key, buffer);
    return { key, url: uploadUrlOf(key) };
  }

  /**
   * @param key 存储键。
   */
  async remove(key: string): Promise<void> {
    this.assertKey(key);
    await this.delete(key);
  }

  /**
   * 校验 key 形状。
   *
   * key 里只可能是"年月 + 内容哈希 + 白名单扩展名"，任何用户提供的字符串都进不来；
   * 这是路径穿越的第一道闸（第二道是 `express.static` 自己的规范化）。
   *
   * @param key 待校验的键。
   * @throws {ApiError} 形状不合法 → 422。
   */
  protected assertKey(key: string): void {
    if (!UPLOAD_KEY_PATTERN.test(key)) {
      throw ApiError.validationFailed('存储键格式不合法');
    }
  }

  /**
   * 由内容算出存储键：`<UTC 年>/<UTC 月>/<sha256 前 8 位>.<扩展名>`。
   *
   * 同一份内容永远得到同一个 key，所以重复上传是幂等的（适配器各自跳过写入）。
   *
   * @param buffer 文件内容。
   * @returns 存储键。
   * @throws {ApiError} 类型不在白名单 → 422 `UNSUPPORTED_MEDIA_TYPE`。
   */
  protected buildKey(buffer: Buffer): string {
    const mime = sniffImageMime(buffer);
    if (mime === null) {
      throw ApiError.unsupportedMediaType();
    }

    const at = this.now();
    const year = String(at.getUTCFullYear()).padStart(4, '0');
    const month = String(at.getUTCMonth() + 1).padStart(2, '0');
    const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
    const extension = UPLOAD_MIME_EXTENSIONS[mime];
    return `${year}/${month}/${digest}.${extension}`;
  }

  /**
   * 落盘/落内存的具体实现。
   *
   * @param key 已校验的存储键。
   * @param buffer 文件内容。
   */
  protected abstract write(key: string, buffer: Buffer): Promise<void>;

  /**
   * 删除的具体实现（不存在时不抛错）。
   *
   * @param key 已校验的存储键。
   */
  protected abstract delete(key: string): Promise<void>;
}
