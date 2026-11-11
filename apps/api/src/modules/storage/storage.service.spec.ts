/**
 * 存储层单元测试：两个适配器跑**同一组**断言。
 *
 * 用 `describe.each` 而不是各写一份的原因：票 09 的要求是"两个适配器都有单测"，
 * 而真正的风险不是"某个适配器没测"，是"两个适配器行为不一致"——
 * 测试用内存跑、生产用本地卷，语义一旦分叉，测试就再也不能证明生产的行为。
 * 所以断言只有一份，适配器作为参数传进去。
 */
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error';
import { InMemoryStorage } from './in-memory.storage';
import { LocalDiskStorage } from './local-disk.storage';
import { sniffImageMime, type StorageService } from './storage.service';

/** 固定时钟：`2026-11-20T10:00:00Z`，让 key 里的年月可预期。 */
const FIXED_NOW = new Date('2026-11-20T10:00:00.000Z');

/** 上限设为 1024 字节，方便构造"刚好超一点"的输入（env 校验的最小值也是 1024）。 */
const MAX_BYTES = 1024;

/** 一张最小的合法 PNG（8 字节魔数 + 少量数据），用于走通成功路径。 */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('tiny-blogs-png-payload', 'utf8'),
]);

/** 一张最小的合法 JPEG（FF D8 FF）。 */
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('tiny-blogs-jpeg-payload', 'utf8'),
]);

/** 一个伪装成 PNG 的可执行文件：扩展名与 Content-Type 都对，魔数不对。 */
const FAKE_PNG = Buffer.from('MZ\x90\x00this-is-not-an-image', 'latin1');

/** 一段 SVG：能当图片用，但白名单里刻意没有它（储存型 XSS 面）。 */
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'utf8');

/** 一个适配器工厂 + 它自己的清理动作。 */
interface AdapterCase {
  readonly name: string;
  readonly create: () => Promise<{ storage: StorageService; cleanup: () => Promise<void> }>;
}

/** 每个用例都断言一次"拒绝理由必须是 ApiError"。 */
async function expectApiError(
  run: () => Promise<unknown>,
  expected: { status: number; code: string },
): Promise<ApiError> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught, '期望抛出 ApiError，但调用成功了').toBeInstanceOf(ApiError);
  const apiError = caught as ApiError;
  expect(apiError.getStatus()).toBe(expected.status);
  expect(apiError.code).toBe(expected.code);
  return apiError;
}

/**
 * 取本地卷里某个 key 的实际字节数；内存适配器用 `read()` 代替。
 *
 * @param storage 存储实例。
 * @param key 存储键。
 * @returns 字节数；不存在返回 `null`。
 */
async function storedBytes(storage: StorageService, key: string): Promise<number | null> {
  if (storage instanceof InMemoryStorage) {
    return storage.read(key)?.byteLength ?? null;
  }
  if (storage instanceof LocalDiskStorage) {
    const info = await stat(join(storage.rootDir, key)).catch(() => null);
    return info?.size ?? null;
  }
  throw new Error('未知的存储适配器');
}

const ADAPTERS: readonly AdapterCase[] = [
  {
    name: 'LocalDiskStorage',
    create: async () => {
      const dir = await mkdtemp(join(tmpdir(), 'tiny-blogs-upload-'));
      return {
        storage: new LocalDiskStorage({ dir, maxBytes: MAX_BYTES, now: () => FIXED_NOW }),
        cleanup: () => rm(dir, { recursive: true, force: true }),
      };
    },
  },
  {
    name: 'InMemoryStorage',
    create: async () => ({
      storage: new InMemoryStorage(MAX_BYTES, () => FIXED_NOW),
      // 内存适配器不碰磁盘，清理是空操作——保持同样的调用形状即可。
      cleanup: () => Promise.resolve(),
    }),
  },
];

describe.each(ADAPTERS)('$name', ({ create }: AdapterCase) => {
  let storage: StorageService;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const created = await create();
    storage = created.storage;
    cleanup = created.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('写入 PNG：key 由内容哈希与 UTC 年月组成，url 是站内相对路径', async () => {
    const result = await storage.put({ content: PNG_BYTES, mime: 'image/png', size: PNG_BYTES.length });

    expect(result.key).toMatch(/^2026\/11\/[0-9a-f]{8}\.png$/);
    expect(result.url).toBe(`/uploads/${result.key}`);
    expect(await storedBytes(storage, result.key)).toBe(PNG_BYTES.length);
  });

  it('扩展名由字节决定，与客户端声明的 mime 无关', async () => {
    // 客户端说这是 png，实际是 jpeg：按字节落成 .jpg。
    const result = await storage.put({
      content: JPEG_BYTES,
      mime: 'image/png',
      size: JPEG_BYTES.length,
    });

    expect(result.key.endsWith('.jpg')).toBe(true);
  });

  it('同一份内容重复上传是幂等的：同一个 key，只存一份', async () => {
    const first = await storage.put({ content: PNG_BYTES, mime: 'image/png', size: PNG_BYTES.length });
    const second = await storage.put({ content: PNG_BYTES, mime: 'image/png', size: PNG_BYTES.length });

    expect(second.key).toBe(first.key);

    if (storage instanceof InMemoryStorage) {
      expect(storage.size).toBe(1);
    }
    if (storage instanceof LocalDiskStorage) {
      // 目录里只有一个文件（`2026/11` 两层目录之下的那一个）。
      const files = await readdir(join(storage.rootDir, '2026', '11'));
      expect(files).toHaveLength(1);
    }
  });

  it('内容不同则 key 不同（哈希前缀真的在区分内容）', async () => {
    const png = await storage.put({ content: PNG_BYTES, mime: 'image/png', size: PNG_BYTES.length });
    const jpeg = await storage.put({
      content: JPEG_BYTES,
      mime: 'image/jpeg',
      size: JPEG_BYTES.length,
    });

    expect(png.key).not.toBe(jpeg.key);
  });

  it('超过上限 → 422 FILE_TOO_LARGE', async () => {
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_BYTES)]);

    const error = await expectApiError(
      () => storage.put({ content: oversized, mime: 'image/png', size: oversized.length }),
      { status: 422, code: 'FILE_TOO_LARGE' },
    );
    expect(error.message).toContain('MB');
  });

  it('流式输入超限会中途中止，不把整段读进内存', async () => {
    const chunks = [PNG_BYTES, Buffer.alloc(MAX_BYTES), Buffer.alloc(MAX_BYTES)];
    const stream = Readable.from(chunks);

    await expectApiError(
      () => storage.put({ content: stream, mime: 'image/png', size: 0 }),
      { status: 422, code: 'FILE_TOO_LARGE' },
    );
  });

  it('恰好等于上限时通过（边界值不误杀）', async () => {
    const exact = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_BYTES - PNG_BYTES.length)]);

    const result = await storage.put({ content: exact, mime: 'image/png', size: exact.length });
    expect(await storedBytes(storage, result.key)).toBe(MAX_BYTES);
  });

  it('魔数不对（伪装成 png 的可执行文件）→ 422 UNSUPPORTED_MEDIA_TYPE', async () => {
    await expectApiError(
      () => storage.put({ content: FAKE_PNG, mime: 'image/png', size: FAKE_PNG.length }),
      { status: 422, code: 'UNSUPPORTED_MEDIA_TYPE' },
    );
  });

  it('SVG 被拒绝：白名单里没有它（储存型 XSS 面）', async () => {
    await expectApiError(
      () => storage.put({ content: SVG_BYTES, mime: 'image/svg+xml', size: SVG_BYTES.length }),
      { status: 422, code: 'UNSUPPORTED_MEDIA_TYPE' },
    );
  });

  it('remove 之后对象消失，再 remove 一次也不报错', async () => {
    const { key } = await storage.put({ content: PNG_BYTES, mime: 'image/png', size: PNG_BYTES.length });

    await storage.remove(key);
    expect(await storedBytes(storage, key)).toBeNull();

    // 幂等：删一个不存在的 key 视为成功，便于重试。
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('remove 的 key 形状不合法 → 422（挡住路径穿越）', async () => {
    await expectApiError(() => storage.remove('../../.env'), {
      status: 422,
      code: 'VALIDATION_FAILED',
    });
    await expectApiError(() => storage.remove('2026/11/not-a-hash.png'), {
      status: 422,
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('sniffImageMime', () => {
  it('识别四种白名单格式', () => {
    expect(sniffImageMime(PNG_BYTES)).toBe('image/png');
    expect(sniffImageMime(JPEG_BYTES)).toBe('image/jpeg');
    expect(sniffImageMime(Buffer.from('GIF89a.....', 'latin1'))).toBe('image/gif');
    expect(sniffImageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('image/webp');
  });

  it('空内容与截断内容不抛错，只返回 null', () => {
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
    expect(sniffImageMime(Buffer.from([0x89]))).toBeNull();
    expect(sniffImageMime(Buffer.from('RIFF', 'latin1'))).toBeNull();
  });
});

describe('LocalDiskStorage 的路径防护', () => {
  it('key 形状被绕过时也不会写到根目录之外', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tiny-blogs-escape-'));
    const storage = new LocalDiskStorage({ dir, maxBytes: MAX_BYTES, now: () => FIXED_NOW });

    try {
      // 直接调用基类的 public 入口会被 `assertKey` 拦下；这里绕过校验，
      // 验证第二道闸（`absolutePath`）本身也在生效。
      const write = (storage as unknown as { write: (k: string, b: Buffer) => Promise<void> }).write;
      await expect(write.call(storage, '../escaped.png', PNG_BYTES)).rejects.toThrow(/根目录之外/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
