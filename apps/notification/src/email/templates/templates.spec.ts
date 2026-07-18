import { render } from '@react-email/components';
import { VerifyEmail } from './verify-email';
import { ResetPasswordEmail } from './reset-password';
import { StockLowAlertEmail } from './stock-low-alert';

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
        available: 2,
        minQuantity: 10,
      }),
    );
    expect(html).toContain('SKU-1');
    expect(html).toContain('2');
    expect(html).toContain('10');
  });
});
