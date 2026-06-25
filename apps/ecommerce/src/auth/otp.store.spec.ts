import { ConfigService } from '@nestjs/config';
import { OtpStore } from './otp.store';

jest.mock('ioredis', () => require('ioredis-mock'));

function makeStore() {
  const config = {
    getOrThrow: (k: string) => (k === 'REDIS_HOST' ? 'localhost' : 6379),
    get: () => undefined,
  } as unknown as ConfigService;
  return new OtpStore(config);
}

describe('OtpStore', () => {
  it('issue rồi verify đúng mã → true, và xóa key (verify lại false)', async () => {
    const store = makeStore();
    await store.issue('c1', 'verify_email', '123456');
    expect(await store.verify('c1', 'verify_email', '123456')).toBe(true);
    expect(await store.verify('c1', 'verify_email', '123456')).toBe(false);
  });

  it('mã sai → false; sai đủ 5 lần → mã bị vô hiệu', async () => {
    const store = makeStore();
    await store.issue('c1', 'verify_email', '123456');
    for (let i = 0; i < 5; i++) {
      expect(await store.verify('c1', 'verify_email', '000000')).toBe(false);
    }
    // hết lần thử → mã đúng cũng không còn dùng được
    expect(await store.verify('c1', 'verify_email', '123456')).toBe(false);
  });

  it('issue lần 2 ghi đè mã cũ', async () => {
    const store = makeStore();
    await store.issue('c1', 'reset_password', '111111');
    await store.issue('c1', 'reset_password', '222222');
    expect(await store.verify('c1', 'reset_password', '111111')).toBe(false);
    expect(await store.verify('c1', 'reset_password', '222222')).toBe(true);
  });
});
