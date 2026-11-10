/**
 * 极简 Cookie 读取工具。
 *
 * 只为了少引一个 `cookie-parser` 中间件：刷新令牌只需要按名取一个值，
 * 而且这里的行为必须可被单测覆盖（见 `cookies.spec.ts`）。
 */

/**
 * 从 `Cookie` 请求头里按名取值。
 *
 * @param cookieHeader 原始 `Cookie` 头（可能是 undefined）。
 * @param name 目标 cookie 名。
 * @returns 解码后的值；不存在或头部为空时返回 `null`。
 */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (typeof cookieHeader !== 'string' || cookieHeader.trim() === '') {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }
    const rawValue = part.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      // 非法百分号编码：按原样返回，交由上层哈希后判定为不存在。
      return rawValue;
    }
  }

  return null;
}
