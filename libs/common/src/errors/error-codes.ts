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

  // ── WMS — Warehouse Structure ──────────────────────────────────────────────
  WAREHOUSE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy kho',
  },
  WAREHOUSE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã khu vực đã tồn tại trong kho này',
  },
  ZONE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy khu vực',
  },
  ZONE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã khu vực đã tồn tại trong kho này',
  },
  RACK_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy kệ',
  },
  RACK_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã kệ đã tồn tại trong zone này',
  },
  SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy tầng kệ',
  },
  SHELF_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã barcode tầng đã tồn tại',
  },

  // ── WMS — Supplier ─────────────────────────────────────────────────────────
  SUPPLIER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy nhà cung cấp',
  },
  SUPPLIER_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã nhà cung cấp đã tồn tại',
  },
  SUPPLIER_BLACKLISTED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Nhà cung cấp đang bị blacklist — chỉ ADMIN mới gỡ được',
  },
  SUPPLIER_NOT_ACTIVE: {
    status: HttpStatus.FORBIDDEN,
    message: 'Nhà cung cấp không ở trạng thái ACTIVE — không thể xác nhận PO',
  },
  SUPPLIER_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy thông tin giá của SKU này',
  },
  SUPPLIER_ITEM_SKU_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'SKU này đã có NCC chính — cập nhật thay vì tạo mới',
  },

  // ── WMS — Purchase Order ────────────────────────────────────────────────────
  PO_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy đơn đặt hàng',
  },
  PO_PRICE_MISSING: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Thiếu đơn giá — SKU chưa có báo giá NCC, cần nhập tay',
  },

  // ── WMS — Goods Receipt Note ────────────────────────────────────────────
  GRN_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu nhập kho',
  },
  GRN_INVALID_STATUS_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'Trạng thái phiếu nhập kho không hợp lệ cho thao tác này',
  },
  GRN_ITEM_NOT_IN_PO: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng không thuộc đơn đặt hàng tham chiếu',
  },
  GRN_LOT_INFO_MISSING: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng có hạn dùng — cần nhập lô và hạn sử dụng',
  },
  GRN_QTY_EXCEEDS_PO: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng nhận vượt quá số lượng đặt còn lại của đơn hàng',
  },
  GRN_STAGING_SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Kho chưa cấu hình vị trí nhận hàng (staging)',
  },
  PO_NOT_RECEIVABLE: {
    status: HttpStatus.CONFLICT,
    message:
      'Đơn đặt hàng đã hủy hoặc đã nhận đủ, không thể tạo phiếu nhập mới',
  },

  // ── WMS — Users ────────────────────────────────────────────────────────────
  USER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy nhân viên',
  },
  USER_FORBIDDEN_ADMIN_TARGET: {
    status: HttpStatus.FORBIDDEN,
    message: 'Không đủ quyền thao tác với tài khoản có vai trò ADMIN',
  },
  USER_CANNOT_DELETE_SELF: {
    status: HttpStatus.FORBIDDEN,
    message: 'Không thể tự xóa tài khoản của chính mình',
  },
} as const;

export type CommonErrorCode = keyof typeof ERROR_CATALOG;
