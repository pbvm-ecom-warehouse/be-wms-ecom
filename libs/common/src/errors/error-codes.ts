import { HttpStatus } from '@nestjs/common';

/**
 * Catalog mã lỗi CHUNG cho mọi app. Mỗi code có HTTP status + message mặc định.
 * App tự thêm mã miền (vd STOCK_INSUFFICIENT) ở apps/<app>/src/common/error-codes.ts —
 * AppException nhận mọi chuỗi code, không bắt buộc nằm trong catalog này.
 */
export const ERROR_CATALOG = {
  // ── Cross-cutting ────────────────────────────────────────────────────────
  VALIDATION_FAILED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Dữ liệu không hợp lệ',
  },
  UNAUTHENTICATED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Chưa xác thực',
  },
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: 'Không đủ quyền truy cập',
  },
  NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy tài nguyên',
  },
  CONFLICT: { status: HttpStatus.CONFLICT, message: 'Xung đột trạng thái' },
  RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Quá nhiều yêu cầu, thử lại sau',
  },
  INTERNAL: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Lỗi hệ thống',
  },

  // ── Auth (dùng chung cả WMS lẫn Ecommerce) ──────────────────────────────
  AUTH_INVALID_CREDENTIALS: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Sai tài khoản hoặc mật khẩu',
  },
  AUTH_TOKEN_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Token không hợp lệ hoặc đã hết hạn',
  },
  AUTH_ACCOUNT_INACTIVE: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Tài khoản không còn hiệu lực',
  },
  AUTH_FIREBASE_NO_EMAIL: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Firebase token không chứa email',
  },
  AUTH_FIREBASE_UID_MISMATCH: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Tài khoản đã liên kết với Firebase account khác',
  },
  AUTH_FIREBASE_LOGIN_FAILED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Không thể đăng nhập bằng Firebase',
  },
  AUTH_OTP_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mã không đúng hoặc đã hết hạn',
  },
  AUTH_EMAIL_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Email đã được đăng ký',
  },
  // Chỉ WMS dùng — đặt ở cross-cutting vì Firebase auth logic nằm trong libs/common
  AUTH_WMS_NOT_INITIALIZED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Nhân viên chưa được khởi tạo trong WMS',
  },
  AUTH_BOOTSTRAP_FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: 'Đã có nhân viên trong hệ thống',
  },
} as const;

export type CommonErrorCode = keyof typeof ERROR_CATALOG;
