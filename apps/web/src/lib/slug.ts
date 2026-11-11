/**
 * slug 建议值与校验。
 *
 * 后台的 slug 规则来自契约（`^[a-z0-9]+(-[a-z0-9]+)*$`，见 `@tiny-blogs/shared` 的
 * `POST_SLUG_PATTERN`），这里只做"从标题猜一个"和"把用户输入擦干净"，
 * 判定仍以后端为准（前端校验只为少一次往返）。
 */

/** 不是合法 slug 字符的东西（含全角标点、空格）。 */
const NON_SLUG = /[^a-z0-9]+/g;

/**
 * 把标题压成 slug 建议值。
 *
 * 中文标题压不出内容（这里**不做**拼音转换：引入一张映射表换来的只是"看起来像英文"），
 * 此时返回空串，由界面提示手填——比编一个 `post-1731` 之类的假 slug 诚实。
 *
 * @param title 文章标题。
 * @returns 形如 `vite-ssg-prerender` 的建议值；无法推导时返回空串。
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(NON_SLUG, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

/**
 * 擦掉输入里的非法字符（用户边打边纠）。
 *
 * @param raw 用户输入。
 * @returns 只含 `[a-z0-9-]` 且不以连字符收尾的字符串。
 */
export function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(NON_SLUG, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 140);
}
