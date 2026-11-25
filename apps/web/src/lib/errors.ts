/**
 * 错误文案。
 *
 * 后台各页的 catch 分支只关心"给用户看什么"：请求层已经把所有失败
 * 规范化成 `ApiRequestError`（带服务端返回的中文 `message`），
 * 其余异常一律用调用方给的兜底文案。这条规则只写一次。
 */
import { ApiRequestError } from '../api/client';

/**
 * 把异常翻译成一句人话。
 *
 * @param error 捕获到的异常。
 * @param fallback 非请求异常时的兜底文案。
 * @returns 展示用文案。
 */
export function describeError(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}
