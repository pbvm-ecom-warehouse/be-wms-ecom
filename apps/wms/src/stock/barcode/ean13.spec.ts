import { buildEan13, computeEan13CheckDigit } from './ean13';

describe('computeEan13CheckDigit', () => {
  it('tính đúng checksum cho barcode EAN-13 chuẩn đã biết', () => {
    // 690123456789 → check digit đúng là 2 (kiểm chứng lại bằng thuật toán EAN-13 chuẩn)
    expect(computeEan13CheckDigit('690123456789')).toBe(2);
  });

  it('tính đúng checksum cho 12 số toàn 0', () => {
    expect(computeEan13CheckDigit('000000000000')).toBe(0);
  });
});

describe('buildEan13', () => {
  it('ghép prefix 20 + sequence 10 số (zero-pad) + checksum = đủ 13 ký tự', () => {
    const code = buildEan13('20', 42);
    expect(code).toHaveLength(13);
    expect(code.startsWith('200000000042')).toBe(true);
  });

  it('2 sequence khác nhau → 2 mã khác nhau', () => {
    const a = buildEan13('20', 1);
    const b = buildEan13('20', 2);
    expect(a).not.toBe(b);
  });

  it('throw nếu sequence vượt quá 10 chữ số', () => {
    expect(() => buildEan13('20', 12345678901)).toThrow();
  });

  it('checksum trong mã sinh ra khớp với computeEan13CheckDigit', () => {
    const code = buildEan13('20', 999);
    const first12 = code.slice(0, 12);
    const checkDigit = Number(code[12]);
    expect(checkDigit).toBe(computeEan13CheckDigit(first12));
  });
});
