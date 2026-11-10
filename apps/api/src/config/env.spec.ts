import { describe, expect, it } from 'vitest';
import { EnvValidationError, readApiEnv } from './env';

/** 一份最小的合法配置，用例在此基础上做删改。 */
const VALID_SOURCE: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_NAME: 'tiny_blogs_test',
  DB_USER: 'tiny_blogs',
  DB_PASSWORD: 'unit-test-password',
  JWT_SECRET: 'j'.repeat(48),
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'unit-test-admin-password',
  BUILD_EXPORT_TOKEN: 'b'.repeat(48),
};

describe('readApiEnv', () => {
  it('解析合法配置并应用默认值', () => {
    const env = readApiEnv(VALID_SOURCE);

    expect(env.nodeEnv).toBe('test');
    expect(env.isTest).toBe(true);
    expect(env.apiPort).toBe(3001);
    expect(env.database).toEqual({
      host: '127.0.0.1',
      port: 3306,
      name: 'tiny_blogs_test',
      user: 'tiny_blogs',
      password: 'unit-test-password',
    });
    expect(env.auth.jwt.accessTokenTtl).toBe('15m');
    expect(env.auth.jwt.accessTokenTtlSeconds).toBe(900);
    expect(env.auth.jwt.refreshTokenTtlDays).toBe(30);
    expect(env.auth.loginRateLimit).toBe(5);
    expect(env.auth.loginRateWindowMs).toBe(60_000);
    expect(env.upload.maxBytes).toBe(5_242_880);
    expect(env.buildExport.url).toBe('http://127.0.0.1:3001/api/build/export');
  });

  it('缺失必需变量时列出变量名，且不泄漏已提供的值', () => {
    const source = {
      ...VALID_SOURCE,
      DB_NAME: '',
      JWT_SECRET: undefined,
      ADMIN_PASSWORD: undefined,
    };

    expect(() => readApiEnv(source)).toThrow(EnvValidationError);

    try {
      readApiEnv(source);
      expect.unreachable('应当抛出 EnvValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const problems = (error as EnvValidationError).problems.join('\n');
      expect(problems).toContain('DB_NAME');
      expect(problems).toContain('JWT_SECRET');
      expect(problems).toContain('ADMIN_PASSWORD');
      // 报错文案里不能出现任何变量值。
      expect(problems).not.toContain('unit-test-password');
      expect(problems).not.toContain('tiny_blogs_test');
    }
  });

  it('拒绝 .env.example 的占位值作为 secret', () => {
    const source = { ...VALID_SOURCE, JWT_SECRET: 'change-me-48-bytes-random' };

    expect(() => readApiEnv(source)).toThrow(/JWT_SECRET 仍是占位值/);
  });

  it('拒绝格式非法与越界的数值变量', () => {
    const source = { ...VALID_SOURCE, API_PORT: '70000', ACCESS_TOKEN_TTL: '15 minutes' };

    try {
      readApiEnv(source);
      expect.unreachable('应当抛出 EnvValidationError');
    } catch (error) {
      const problems = (error as EnvValidationError).problems.join('\n');
      expect(problems).toContain('API_PORT');
      expect(problems).toContain('ACCESS_TOKEN_TTL');
    }
  });
});
