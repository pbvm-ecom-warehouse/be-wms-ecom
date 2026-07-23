/**
 * Thuật toán checksum chuẩn EAN-13: từ vị trí 1 (trái→phải, 1-indexed) trên
 * 12 số đầu, vị trí lẻ ×1, vị trí chẵn ×3, tổng rồi lấy (10 - tổng mod 10) mod 10.
 */
export function computeEan13CheckDigit(first12Digits: string): number {
  const digits = first12Digits.split('').map(Number);
  const sum = digits.reduce((acc, d, idx) => {
    const weight = idx % 2 === 0 ? 1 : 3;
    return acc + d * weight;
  }, 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * prefix nội bộ '20' (issue #25) + sequence atomic 10 chữ số (từ barcode_counters,
 * xem barcode.repository.ts) + 1 checksum = 13 ký tự. Sequence do BarcodeService
 * cấp — hàm này chỉ lắp ráp + tính checksum, không tự sinh số.
 */
export function buildEan13(prefix: string, sequence: number): string {
  const sequenceDigits = 12 - prefix.length;
  const sequenceStr = String(sequence);
  if (sequenceStr.length > sequenceDigits) {
    throw new Error(
      `sequence ${sequence} vượt quá ${sequenceDigits} chữ số cho phép (prefix=${prefix})`,
    );
  }
  const first12 = prefix + sequenceStr.padStart(sequenceDigits, '0');
  const checkDigit = computeEan13CheckDigit(first12);
  return first12 + String(checkDigit);
}
