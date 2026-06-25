import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

const sendMock = jest.fn().mockResolvedValue({ data: { id: 'e1' }, error: null });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

function makeService(env: Record<string, string | undefined>) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new EmailService(config);
}

describe('EmailService', () => {
  beforeEach(() => sendMock.mockClear());

  it('có key → gọi Resend với idempotencyKey', async () => {
    const svc = makeService({ RESEND_API_KEY: 'k', RESEND_FROM: 'a@b.com' });
    await svc.send({ to: 'x@y.com', subject: 'Hi', react: {} as any, idempotencyKey: 'job-1' });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'a@b.com', to: 'x@y.com', subject: 'Hi' }),
      { idempotencyKey: 'job-1' },
    );
  });

  it('thiếu API key → tắt mềm, không gọi Resend', async () => {
    const svc = makeService({ RESEND_FROM: 'a@b.com' });
    await svc.send({ to: 'x@y.com', subject: 'Hi', react: {} as any, idempotencyKey: 'job-1' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(svc.isEnabled()).toBe(false);
  });
});
