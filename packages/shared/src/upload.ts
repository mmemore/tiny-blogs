/**
 * 图片上传的契约（`docs/design/fields-and-interfaces.md` §4.5、§5 `POST /api/admin/upload`）。
 *
 * 规则只在这里定义一次：白名单、扩展名映射、key 形状、URL 形状。
 * 后端用它做校验，前端用它判断"这个 URL 是不是本站的图片"。
 */

/** 允许上传的图片类型 → 落盘扩展名。 */
export const UPLOAD_MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
} as const;

/** 允许上传的图片类型。 */
export type UploadMime = keyof typeof UPLOAD_MIME_EXTENSIONS;

/** 白名单的数组形式（校验时遍历用）。 */
export const UPLOAD_MIME_TYPES: readonly UploadMime[] = Object.keys(
  UPLOAD_MIME_EXTENSIONS,
) as UploadMime[];

/**
 * 上传文件的 key 形状：`2026/11/ab12cd34.png`。
 *
 * 只用 `[0-9a-f]{8}`（内容 sha256 的前 8 位）而不是用户提供的文件名——
 * key 里出现任何用户输入都会变成路径穿越的入口。
 */
export const UPLOAD_KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{8}\.(?:png|jpg|gif|webp)$/;

/** 上传成功后返回给调用方的引用。 */
export interface UploadResult {
  /** 存储层的键，形如 `2026/11/ab12cd34.png`。 */
  readonly key: string;
  /** 可直接写进 Markdown 的站内地址，形如 `/uploads/2026/11/ab12cd34.png`。 */
  readonly url: string;
}

/** 静态资源的 URL 前缀。反向代理需要把这一条与 `/api` 一起转发到同一个后端。 */
export const UPLOAD_URL_PREFIX = '/uploads';

/**
 * 由 key 拼出站内 URL。
 *
 * @param key 存储键。
 * @returns 形如 `/uploads/2026/11/ab12cd34.png`。
 */
export function uploadUrlOf(key: string): string {
  return `${UPLOAD_URL_PREFIX}/${key}`;
}
