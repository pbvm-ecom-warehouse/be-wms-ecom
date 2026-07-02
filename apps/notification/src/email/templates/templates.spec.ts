import { render } from '@react-email/components';
import { VerifyEmail } from './verify-email';
import { ResetPasswordEmail } from './reset-password';

describe('email templates', () => {
  it('VerifyEmail chứa mã', async () => {
    const html = await render(VerifyEmail({ code: '654321' }));
    expect(html).toContain('654321');
  });

  it('ResetPasswordEmail chứa mã', async () => {
    const html = await render(ResetPasswordEmail({ code: '987654' }));
    expect(html).toContain('987654');
  });
});
