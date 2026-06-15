import { createHash, randomBytes } from 'crypto';

/**
 * Tiện ích token dùng chung cho auth của các app.
 *
 * Refresh/auth token là chuỗi entropy cao (ngẫu nhiên) nên hash bằng sha256 là đủ
 * (không cần bcrypt như mật khẩu người-đặt): vừa an toàn vừa TRA CỨU ĐƯỢC theo hash
 * (bcrypt có salt nên không query trực tiếp được).
 */

/** Sinh token ngẫu nhiên dạng base64url (mặc định 48 byte ~ 64 ký tự). */
export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hash token để lưu DB (không bao giờ lưu token gốc). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Đổi chuỗi thời lượng ('30d','8h','15m','45s') sang mili-giây.
 * Dùng để tính expiresAt cho refresh token (JWT access đã tự hiểu chuỗi này).
 */
export function durationToMs(input: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!m) throw new Error(`Thời lượng không hợp lệ: "${input}"`);
  const n = Number(m[1]);
  const unit: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * unit[m[2]];
}
