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
    // Kiểm tra specific rendered fragment với distinctive values (234/5678)
    // không nhầm với CSS values. Pattern accounts for React HTML comments between values.
    expect(html).toMatch(/234.*\/.*5678/);
  });

  it('StockNearExpiryEmail chứa SKU, lô và ngày hết hạn', async () => {
    const html = await render(
      StockNearExpiryEmail({
        sku: 'SKU-EXP-999',
        lotNumber: 'LOT-EXP-777',
        expiryDate: '2026-12-31T00:00:00.000Z',
      }),
    );
    // Kiểm tra các distinctive values để đảm bảo component render đúng props
    expect(html).toContain('SKU-EXP-999');
    expect(html).toContain('LOT-EXP-777');
    // Ngày format theo vi-VN locale sẽ là 31/12/2026
    expect(html).toContain('31/12/2026');
  });
});
