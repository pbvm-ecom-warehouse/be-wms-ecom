/** Field nhạy cảm bị che trong log (so khớp không phân biệt hoa/thường). */
const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'refreshtoken',
  'accesstoken',
  'token',
  'otp',
  'authorization',
  'cookie',
]);

const MAX_BYTES = 10 * 1024; // 10KB: response lớn hơn chỉ log mô tả
const MAX_ARRAY = 50; // array dài hơn không log full phần tử

/**
 * Làm sạch dữ liệu trước khi đưa vào log: che field nhạy cảm, cắt array/quá lớn.
 * Vì sao: log body request/response dễ rò mật khẩu/JWT và phình log.
 */
export function sanitizeForLog(value: unknown): unknown {
  const seen = new WeakSet<object>();

  function walk(v: unknown): unknown {
    if (Array.isArray(v)) {
      if (v.length > MAX_ARRAY) return `[Array(${v.length}) truncated]`;
      return v.map(walk);
    }
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : walk(val);
      }
      return out;
    }
    return v;
  }

  const result = walk(value);
  const size = Buffer.byteLength(JSON.stringify(result) ?? '');
  if (size > MAX_BYTES) return `[Payload ${size} bytes truncated]`;
  return result;
}
