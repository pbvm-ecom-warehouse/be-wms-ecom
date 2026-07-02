import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

describe('AppException', () => {
  it('dùng status + message mặc định từ catalog khi chỉ truyền code', () => {
    const ex = new AppException('NOT_FOUND');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.getResponse()).toEqual({
      code: 'NOT_FOUND',
      message: 'Không tìm thấy tài nguyên',
    });
  });

  it('cho phép override message, status và details', () => {
    const ex = new AppException('STOCK_INSUFFICIENT', 'Không đủ tồn', 409, [
      { field: 'quantity', issue: 'available=3 < requested=5' },
    ]);
    expect(ex.getStatus()).toBe(409);
    expect(ex.code).toBe('STOCK_INSUFFICIENT');
    expect(ex.getResponse()).toEqual({
      code: 'STOCK_INSUFFICIENT',
      message: 'Không đủ tồn',
      details: [{ field: 'quantity', issue: 'available=3 < requested=5' }],
    });
  });

  it('mã miền không có trong catalog + không truyền status → mặc định 400', () => {
    const ex = new AppException('ORDER_NOT_CANCELLABLE', 'Đơn không thể hủy');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});

describe('auth error codes', () => {
  it.each([
    ['AUTH_INVALID_CREDENTIALS', 401],
    ['AUTH_TOKEN_INVALID', 401],
    ['AUTH_ACCOUNT_INACTIVE', 401],
    ['AUTH_FIREBASE_NO_EMAIL', 401],
    ['AUTH_FIREBASE_UID_MISMATCH', 401],
    ['AUTH_FIREBASE_LOGIN_FAILED', 401],
    ['AUTH_OTP_INVALID', 400],
    ['AUTH_EMAIL_CONFLICT', 409],
    ['AUTH_WMS_NOT_INITIALIZED', 401],
    ['AUTH_BOOTSTRAP_FORBIDDEN', 403],
  ] as const)('AppException(%s) → status %i', (code, expectedStatus) => {
    const ex = new AppException(code);
    expect(ex.getStatus()).toBe(expectedStatus);
    const body = ex.getResponse() as { code: string; message: string };
    expect(body.code).toBe(code);
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('override message giữ nguyên status từ catalog', () => {
    const ex = new AppException(
      'AUTH_INVALID_CREDENTIALS',
      'Mật khẩu cũ không đúng',
    );
    expect(ex.getStatus()).toBe(401);
    const body = ex.getResponse() as { code: string; message: string };
    expect(body.message).toBe('Mật khẩu cũ không đúng');
  });
});
