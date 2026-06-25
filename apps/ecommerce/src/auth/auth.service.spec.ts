// Mock @app/common để tránh load firebase-admin/jose (ESM) trong môi trường Jest CJS.
// AppException được export thật (không phụ thuộc ESM) nên giữ lại trong mock.
jest.mock('@app/common', () => ({
  durationToMs: jest.fn(),
  generateOpaqueToken: jest.fn(),
  hashToken: jest.fn(),
  FirebaseAdminService: class {},
  AuthThrottle: () => () => {},
  AppException: class AppException extends Error {
    constructor(
      public readonly code: string,
      public readonly message?: string,
    ) {
      super(message ?? code);
      this.name = 'AppException';
    }
  },
}));

import { AppException } from '@app/common';
import { AuthService } from './auth.service';

function makeService(overrides: Partial<Record<string, any>> = {}) {
  const customer = { _id: { toString: () => 'c1' }, email: 'a@b.com' };
  const customerRepo = {
    findActiveByEmail: jest.fn().mockResolvedValue(customer),
    markEmailVerified: jest.fn().mockResolvedValue(customer),
    updatePassword: jest.fn().mockResolvedValue(customer),
    ...overrides.customerRepo,
  };
  const refreshRepo = {
    revokeAllForCustomer: jest.fn().mockResolvedValue(undefined),
  };
  const otpStore = {
    issue: jest.fn().mockResolvedValue(undefined),
    verify: jest.fn().mockResolvedValue(true),
    ...overrides.otpStore,
  };
  const notifyQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const svc = new AuthService(
    customerRepo,
    refreshRepo as any,
    notifyQueue as any,
    {} as any, // jwt
    {} as any, // firebaseAdmin
    { jwtSecret: 's', jwtExpiresIn: '30d', refreshExpiresIn: '60d' },
    otpStore,
  );
  return { svc, customerRepo, refreshRepo, otpStore };
}

describe('AuthService OTP', () => {
  it('verifyEmail mã đúng → markEmailVerified', async () => {
    const { svc, customerRepo, otpStore } = makeService();
    const res = await svc.verifyEmail('a@b.com', '123456');
    expect(otpStore.verify).toHaveBeenCalledWith(
      'c1',
      'verify_email',
      '123456',
    );
    expect(customerRepo.markEmailVerified).toHaveBeenCalled();
    expect(res).toEqual({ success: true, emailVerified: true });
  });

  it('verifyEmail mã sai → AUTH_OTP_INVALID', async () => {
    const { svc } = makeService({
      otpStore: { verify: jest.fn().mockResolvedValue(false) },
    });
    await expect(svc.verifyEmail('a@b.com', '000000')).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('resetPassword mã đúng → updatePassword + revoke refresh', async () => {
    const { svc, customerRepo, refreshRepo } = makeService();
    const res = await svc.resetPassword('a@b.com', '123456', 'NewP@ssw0rd123!');
    expect(customerRepo.updatePassword).toHaveBeenCalled();
    expect(refreshRepo.revokeAllForCustomer).toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it('resetPassword email không tồn tại → AUTH_OTP_INVALID trung lập (không lộ)', async () => {
    const { svc } = makeService({
      customerRepo: { findActiveByEmail: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.resetPassword('x@y.com', '123456', 'NewP@ssw0rd123!'),
    ).rejects.toBeInstanceOf(AppException);
  });
});
