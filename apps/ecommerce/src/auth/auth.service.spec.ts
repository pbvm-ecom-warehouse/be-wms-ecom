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
import { Types } from 'mongoose';
import { AuthService } from './auth.service';

function makeService(overrides: Partial<Record<string, any>> = {}) {
  const user = { _id: { toString: () => 'c1' }, email: 'a@b.com' };
  const userRepo = {
    findActiveByEmail: jest.fn().mockResolvedValue(user),
    markEmailVerified: jest.fn().mockResolvedValue(user),
    updatePassword: jest.fn().mockResolvedValue(user),
    updateAvatar: jest.fn().mockResolvedValue(user),
    ...overrides.userRepo,
  };
  const refreshRepo = {
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  };
  const otpStore = {
    issue: jest.fn().mockResolvedValue(undefined),
    verify: jest.fn().mockResolvedValue(true),
    ...overrides.otpStore,
  };
  const fcmTokenRepo = {};
  const notifyQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const cloudinary = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/ecom/avatars/x.jpg',
      publicId: 'ecom/avatars/x',
    }),
    ...overrides.cloudinary,
  };
  const svc = new AuthService(
    userRepo,
    refreshRepo as any,
    fcmTokenRepo as any,
    notifyQueue as any,
    {} as any, // jwt
    {} as any, // firebaseAdmin
    cloudinary,
    { jwtSecret: 's', jwtExpiresIn: '30d', refreshExpiresIn: '60d' },
    otpStore,
  );
  return { svc, userRepo, refreshRepo, otpStore, cloudinary };
}

function fakeImageFile(
  overrides: Partial<{ mimetype: string; size: number; buffer: Buffer }> = {},
) {
  return {
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('fake-image'),
    ...overrides,
  };
}

describe('AuthService OTP', () => {
  it('verifyEmail mã đúng → markEmailVerified', async () => {
    const { svc, userRepo, otpStore } = makeService();
    const res = await svc.verifyEmail('a@b.com', '123456');
    expect(otpStore.verify).toHaveBeenCalledWith(
      'c1',
      'verify_email',
      '123456',
    );
    expect(userRepo.markEmailVerified).toHaveBeenCalled();
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
    const { svc, userRepo, refreshRepo } = makeService();
    const res = await svc.resetPassword('a@b.com', '123456', 'NewP@ssw0rd123!');
    expect(userRepo.updatePassword).toHaveBeenCalled();
    expect(refreshRepo.revokeAllForUser).toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it('resetPassword email không tồn tại → AUTH_OTP_INVALID trung lập (không lộ)', async () => {
    const { svc } = makeService({
      userRepo: { findActiveByEmail: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.resetPassword('x@y.com', '123456', 'NewP@ssw0rd123!'),
    ).rejects.toBeInstanceOf(AppException);
  });
});

describe('AuthService uploadAvatar', () => {
  const customerId = new Types.ObjectId().toString();

  it('upload thành công → Cloudinary folder ecom/avatars, lưu avatarUrl', async () => {
    const { svc, userRepo, cloudinary } = makeService();

    const result = await svc.uploadAvatar(customerId, fakeImageFile());

    expect(cloudinary.uploadImage).toHaveBeenCalledWith(
      expect.any(Buffer),
      'ecom/avatars',
    );
    expect(userRepo.updateAvatar).toHaveBeenCalledWith(
      expect.anything(),
      'https://res.cloudinary.com/demo/image/upload/ecom/avatars/x.jpg',
    );
    expect(result).toBeDefined();
  });

  it('sai mimetype → throw VALIDATION_FAILED, không gọi Cloudinary', async () => {
    const { svc, cloudinary } = makeService();

    await expect(
      svc.uploadAvatar('c1', fakeImageFile({ mimetype: 'application/pdf' })),
    ).rejects.toBeInstanceOf(AppException);
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('vượt quá 5MB → throw VALIDATION_FAILED, không gọi Cloudinary', async () => {
    const { svc, cloudinary } = makeService();

    await expect(
      svc.uploadAvatar('c1', fakeImageFile({ size: 6 * 1024 * 1024 })),
    ).rejects.toBeInstanceOf(AppException);
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('user không tồn tại (updateAvatar trả null) → throw UNAUTHENTICATED', async () => {
    const { svc } = makeService({
      userRepo: { updateAvatar: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      svc.uploadAvatar(customerId, fakeImageFile()),
    ).rejects.toBeInstanceOf(AppException);
  });
});
