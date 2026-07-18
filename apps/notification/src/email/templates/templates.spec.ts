import { render } from '@react-email/components';
import { VerifyEmail } from './verify-email';
import { ResetPasswordEmail } from './reset-password';
import { StockLowAlertEmail } from './stock-low-alert';
import { StockNearExpiryEmail } from './stock-near-expiry';

describe('email templates', () => {
  it('VerifyEmail chứa mã', async () => {
    const html = await render(VerifyEmail({ code: '654321' }));
    expect(html).toContain('654321');
  });

  it('ResetPasswordEmail chứa mã', async () => {
    const html = await render(ResetPasswordEmail({ code: '987654' }));
    expect(html).toContain('987654');
  });

  it('StockLowAlertEmail chứa SKU và tồn kho', async () => {
    const html = await render(
      StockLowAlertEmail({
        sku: 'SKU-1',
        warehouseId: 'wh-1',
        available: 234,
        minQuantity: 5678,
      }),
    );
    expect(html).toContain('SKU-1');
    // Kiểm tra ô số liệu (amber stat box) đúng thứ tự available/minQuantity.
    // React render 2 expression liền kề `{available} / {minQuantity}` thành
    // 3 text node cách nhau bởi HTML comment: "234<!-- --> / <!-- -->5678".
    // Regex neo cứng comment + khoảng trắng quanh dấu "/" nên chỉ khớp field
    // stat box (không khớp chuỗi Preview "234/5678" không có khoảng trắng/comment)
    // và KHÔNG khớp nếu available/minQuantity bị hoán đổi vị trí — đã verify thực nghiệm
    // bằng cách render với props swap (available:5678, minQuantity:234): regex cũ
    // `/234.*\/.*5678/` vẫn match (false positive), regex này thì không.
    expect(html).toMatch(/234<!-- -->\s*\/\s*<!-- -->5678/);
  });

  it('StockNearExpiryEmail chứa SKU, lô và ngày hết hạn', async () => {
    const html = await render(
      StockNearExpiryEmail({
        sku: 'SKU-EXP-999',
        lotNumber: 'LOT-EXP-777',
        expiryDate: '2026-12-31T00:00:00.000Z',
      }),
    );
    // Kiểm tra dòng "SKU: {sku} — Lô {lotNumber}" đúng thứ tự vị trí (position-sensitive),
    // không dùng 2 toContain độc lập vì sẽ không bắt được bug hoán đổi sku/lotNumber
    // (vd component vô tình render "SKU: {lotNumber} — Lô {sku}").
    // React SSR chèn comment "<!-- -->" quanh mỗi expression con liền kề text tĩnh, nên
    // HTML thực tế là: "SKU: <!-- -->SKU-EXP-999<!-- --> — Lô <!-- -->LOT-EXP-777".
    // Regex neo cứng "SKU:"/"— Lô" + comment nên chỉ khớp đúng dòng này (không khớp
    // dòng Preview phía trên cũng chứa cả 2 giá trị nhưng theo thứ tự lotNumber trước sku).
    // Đã verify thực nghiệm: render với sku/lotNumber bị swap ở nơi gọi (mô phỏng bug
    // hoán đổi field) khiến regex này FAIL đúng như kỳ vọng, trong khi 2 toContain cũ
    // vẫn PASS (false positive) — kể cả một regex "SKU-EXP-999.*LOT-EXP-777" không neo
    // theo nhãn cũng vẫn PASS sai vì dòng Preview chứa cả 2 giá trị theo thứ tự ngược lại.
    expect(html).toMatch(
      /SKU:\s*<!-- -->SKU-EXP-999<!-- -->\s*—\s*Lô\s*<!-- -->LOT-EXP-777/,
    );
    // Ngày format theo vi-VN locale sẽ là 31/12/2026 (giá trị tính toán đơn, không có
    // vấn đề thứ tự — giữ nguyên theo review).
    expect(html).toContain('31/12/2026');
  });
});
