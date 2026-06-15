import { HttpStatus } from '@nestjs/common';

/**
 * Catalog mã lỗi CHUNG cho mọi app. Mỗi code có HTTP status + message mặc định.
 * App tự thêm mã miền (vd STOCK_INSUFFICIENT) ở apps/<app>/src/common/error-codes.ts —
 * AppException nhận mọi chuỗi code, không bắt buộc nằm trong catalog này.
 */
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: HttpStatus.BAD_REQUEST, message: 'Dữ liệu không hợp lệ' },
  UNAUTHENTICATED: { status: HttpStatus.UNAUTHORIZED, message: 'Chưa xác thực' },
  FORBIDDEN: { status: HttpStatus.FORBIDDEN, message: 'Không đủ quyền truy cập' },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Không tìm thấy tài nguyên' },
  CONFLICT: { status: HttpStatus.CONFLICT, message: 'Xung đột trạng thái' },
  RATE_LIMITED: { status: HttpStatus.TOO_MANY_REQUESTS, message: 'Quá nhiều yêu cầu, thử lại sau' },
  INTERNAL: { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Lỗi hệ thống' },
} as const;

export type CommonErrorCode = keyof typeof ERROR_CATALOG;
