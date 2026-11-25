/**
 * 数据库错误的识别工具。
 *
 * 驱动层抛出的唯一键冲突是 `code === 'ER_DUP_ENTRY'`；调用方需要据此决定
 * 「重试」还是「翻译成 409」。判断只在这里写一次，避免各处复制字符串。
 */

/**
 * 判断是否为 MySQL 唯一键冲突（`ER_DUP_ENTRY`）。
 *
 * @param error 捕获到的异常。
 * @returns 命中重复键返回 true。
 */
export function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  );
}
