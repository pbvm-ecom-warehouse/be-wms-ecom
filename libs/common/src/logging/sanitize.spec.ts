import { sanitizeForLog } from './sanitize';

describe('sanitizeForLog', () => {
  it('che field nhạy cảm bất kể hoa/thường', () => {
    expect(sanitizeForLog({ username: 'a', password: 'secret', refreshToken: 'r' })).toEqual({
      username: 'a',
      password: '[REDACTED]',
      refreshToken: '[REDACTED]',
    });
  });

  it('che lồng sâu trong object', () => {
    expect(sanitizeForLog({ data: { user: { token: 'x', name: 'b' } } })).toEqual({
      data: { user: { token: '[REDACTED]', name: 'b' } },
    });
  });

  it('array dài hơn 50 → cắt thành mô tả', () => {
    const big = Array.from({ length: 51 }, (_, i) => i);
    expect(sanitizeForLog(big)).toBe('[Array(51) truncated]');
  });

  it('giữ nguyên giá trị primitive nhỏ', () => {
    expect(sanitizeForLog({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
  });
});
