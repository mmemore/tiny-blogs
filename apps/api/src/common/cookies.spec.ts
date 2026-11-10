import { describe, expect, it } from 'vitest';
import { readCookie } from './cookies';

describe('readCookie', () => {
  it('按名取出单个 cookie', () => {
    expect(readCookie('refresh_token=abc123', 'refresh_token')).toBe('abc123');
  });

  it('在多个 cookie 中挑出目标项并忽略前后空白', () => {
    expect(readCookie('a=1; refresh_token=abc123 ; b=2', 'refresh_token')).toBe('abc123');
  });

  it('解码百分号编码的值', () => {
    expect(readCookie('refresh_token=a%2Bb%2Fc', 'refresh_token')).toBe('a+b/c');
  });

  it('缺失、空头、无等号片段时返回 null', () => {
    expect(readCookie(undefined, 'refresh_token')).toBeNull();
    expect(readCookie('', 'refresh_token')).toBeNull();
    expect(readCookie('other=1', 'refresh_token')).toBeNull();
    expect(readCookie('malformed', 'refresh_token')).toBeNull();
  });

  it('不会被同名后缀欺骗', () => {
    expect(readCookie('not_refresh_token=evil', 'refresh_token')).toBeNull();
  });
});
