/**
 * 测试用配置：在仓库 `.env` 的基础上改出"可测"的一份。
 *
 * - `DB_NAME` 指向独立 schema（`tiny_blogs_test`），绝不碰开发库；
 * - `AUTH_LOGIN_RATE_LIMIT` 调高，避免同一文件里的多次登录被限流误伤
 *   （限流本身另有专门的用例，用默认值起一个独立应用来验证）。
 */
import { loadEnvFile } from '../../src/config/dotenv';
import { readApiEnv, type ApiEnv } from '../../src/config/env';

/** 测试专用 schema 名，与 `docker/mysql-init/01-test-schema.sh` 对齐。 */
export const TEST_DB_NAME = 'tiny_blogs_test';

/**
 * 构造测试配置。
 *
 * @param overrides 需要覆盖的原始环境变量。
 * @returns 校验后的配置对象。
 */
export function createTestEnv(overrides: Readonly<Record<string, string>> = {}): ApiEnv {
  loadEnvFile();
  return readApiEnv({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
    AUTH_LOGIN_RATE_LIMIT: '10000',
    ...overrides,
  });
}
