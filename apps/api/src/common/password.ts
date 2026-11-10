import { argon2id, hash, verify } from 'argon2';

/**
 * argon2id 参数（OWASP 推荐的最小配置：19 MiB 内存、2 轮、并行度 1）。
 * 参数集中在这里，哈希与校验永远使用同一份，避免两边漂移。
 */
export const PASSWORD_HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * 计算密码哈希（argon2id）。
 *
 * @param plain 明文口令。
 * @returns PHC 格式的哈希字符串。
 * @throws {Error} 口令为空时抛出。
 */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length === 0) {
    throw new Error('口令不得为空');
  }
  return hash(plain, PASSWORD_HASH_OPTIONS);
}

/**
 * 校验口令与哈希是否匹配。
 *
 * @param passwordHash 数据库里的哈希。
 * @param plain 待校验的明文口令。
 * @returns 匹配 true；哈希格式非法或校验异常一律返回 false（不抛错，避免登录接口泄漏内部细节）。
 */
export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    // argon2 从 PHC 字符串里读算法与参数，无需再传选项（避免与哈希时不一致）。
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
