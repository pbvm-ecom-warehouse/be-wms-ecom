import { HttpStatus } from '@nestjs/common';

/**
 * Catalog mã lỗi CHUNG cho mọi app. Mỗi code có HTTP status + message mặc định.
 * AppException nhận mọi chuỗi code, không bắt buộc nằm trong catalog này — nhưng
 * NẾU không có ở đây, AppException fallback về HttpStatus.BAD_REQUEST + message=code
 * (xem app.exception.ts). Vì AppException chỉ đọc catalog này (không đọc file nào
 * khác), toàn bộ code domain của mọi app (kể cả WMS-only) đặt tại đây.
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

  // ── WMS — Location Structure (Zone/Rack/Shelf) ──────────────────────────────
  ZONE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy khu vực',
  },
  ZONE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã khu vực đã tồn tại',
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
  AISLE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lối đi',
  },
  AISLE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã lối đi đã tồn tại',
  },
  RACK_TEMPLATE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy template kệ',
  },
  GATE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy cổng',
  },
  GATE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã cổng đã tồn tại',
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
    message: 'Không tìm thấy báo giá NCC cho SKU này',
  },
  SUPPLIER_ITEM_PAIR_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Cặp SKU và NCC này đã có báo giá — cập nhật thay vì tạo mới',
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
  PO_QTY_BELOW_MOQ: {
    status: HttpStatus.BAD_REQUEST,
    message:
      'Số lượng đặt thấp hơn số lượng đặt tối thiểu (MOQ) của NCC cho SKU này',
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
  USER_USERNAME_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Tên đăng nhập đã được sử dụng',
  },
  USER_EMAIL_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Email đã được sử dụng',
  },
  USER_PHONE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Số điện thoại đã được sử dụng',
  },

  // ── WMS — Stock (WarehouseItem) ─────────────────────────────────────────
  STOCK_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng trong kho',
  },
  STOCK_ITEM_SKU_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'SKU đã tồn tại trong hệ thống',
  },
  STOCK_INSUFFICIENT: {
    status: HttpStatus.CONFLICT,
    message: 'Số lượng tồn kho không đủ',
  },
  LOT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lô hàng',
  },

  // ── WMS — Putaway ────────────────────────────────────────────────────────
  PUTAWAY_TASK_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lệnh sắp xếp',
  },
  PUTAWAY_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng theo barcode đã quét',
  },
  PUTAWAY_SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy vị trí theo barcode đã quét',
  },
  PUTAWAY_SHELF_IS_STAGING: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Không thể xếp hàng vào chính vị trí nhận hàng tạm (staging)',
  },
  PUTAWAY_ITEM_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng hoặc lô quét được không thuộc lệnh sắp xếp này',
  },
  PUTAWAY_QTY_EXCEEDS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng quét vượt quá số lượng còn lại cần xếp',
  },

  // ── WMS — Goods Issue ────────────────────────────────────────────────────
  GOODS_ISSUE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu xuất kho',
  },
  GOODS_ISSUE_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng theo barcode đã quét',
  },
  GOODS_ISSUE_SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy vị trí theo barcode đã quét',
  },
  GOODS_ISSUE_ITEM_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng quét được không thuộc phiếu xuất kho này',
  },
  GOODS_ISSUE_QTY_EXCEEDS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng quét vượt quá số lượng còn lại cần xuất',
  },

  // ── WMS — Print Job ──────────────────────────────────────────────────────
  PRINT_JOB_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lệnh in',
  },
  PRINT_JOB_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng theo barcode đã quét',
  },
  PRINT_JOB_SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy vị trí theo barcode đã quét',
  },
  PRINT_JOB_ITEM_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng quét được không thuộc lệnh in này',
  },
  PRINT_JOB_QTY_EXCEEDS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng quét vượt quá số lượng còn lại/đã tiêu thụ',
  },
  PRINT_JOB_ITEM_NOT_CONSUMED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Dòng chưa tiêu thụ hết CUP_BLANK, chưa thể xác nhận in xong',
  },
  PRINT_JOB_ITEM_ALREADY_COMPLETED: {
    status: HttpStatus.CONFLICT,
    message: 'Dòng này đã được xác nhận in xong trước đó',
  },

  // ── WMS — Stock Count ────────────────────────────────────────────────────
  STOCK_COUNT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu kiểm kho',
  },
  STOCK_COUNT_EMPTY_SCOPE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Không có tồn kho nào trong phạm vi đã chọn',
  },
  STOCK_COUNT_ITEM_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Vị trí/lô không thuộc phiếu kiểm kho này',
  },
  STOCK_COUNT_ALREADY_APPROVED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu đã duyệt, không thể sửa',
  },
  STOCK_COUNT_NOT_COMPLETED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu chưa đếm xong, không thể duyệt',
  },

  // ── WMS — Scrap Note ─────────────────────────────────────────────────────
  SCRAP_NOTE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu hủy hàng',
  },
  SCRAP_NOTE_ITEM_ISPERISHABLE_NO_LOT: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng có hạn sử dụng phải chọn lô khi đề xuất hủy',
  },
  SCRAP_NOTE_QTY_EXCEEDS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng đề xuất hủy vượt quá tồn thật tại vị trí này',
  },
  SCRAP_NOTE_ALREADY_DECIDED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu đã được duyệt hoặc từ chối, không thể xử lý lại',
  },

  // ── WMS — Goods Return ───────────────────────────────────────────────────
  GOODS_RETURN_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu hoàn hàng',
  },
  GOODS_RETURN_ALREADY_DECIDED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu đã xử lý xong hoặc đã huỷ, không thể thao tác lại',
  },
  GOODS_RETURN_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Dòng hàng không tồn tại trong phiếu hoàn',
  },
  GOODS_RETURN_NOT_INSPECTED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu chưa được kiểm tra tình trạng, không thể xác nhận',
  },
  GOODS_RETURN_ITEM_ISPERISHABLE_NO_LOT: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng có hạn sử dụng phải chọn lô khi nhập lại hàng tốt',
  },

  // ── WMS — Shipping ───────────────────────────────────────────────────────
  CARRIER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy đơn vị vận chuyển',
  },
  CARRIER_CODE_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Mã đơn vị vận chuyển đã tồn tại',
  },
  CARRIER_INACTIVE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Đơn vị vận chuyển đã ngừng hoạt động',
  },
  SHIPMENT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy vận đơn',
  },
  SHIPMENT_INVALID_TRANSITION: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Không thể chuyển sang trạng thái này từ trạng thái hiện tại',
  },
  SHIPMENT_NOT_ASSIGNED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Vận đơn chưa được gán hãng vận chuyển',
  },

  // ── WMS — SKU Template / Attribute Option / Barcode Registry (issue #25) ──
  // AppException chỉ resolve status/message qua ERROR_CATALOG (xem
  // libs/common/src/errors/app.exception.ts) — KHÔNG thêm code domain WMS vào
  // apps/wms/src/common/error-codes.ts nữa (file đó đã bị xóa vì chưa từng
  // được đọc, mọi throw new AppException('CODE') từng âm thầm trả 400 sai).
  STOCK_SKU_TEMPLATE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy template SKU cho loại/nhóm mặt hàng này',
  },
  STOCK_SKU_TEMPLATE_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'templateId không khớp với itemType/category đã chọn',
  },
  STOCK_ATTRIBUTE_OPTION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy option thuộc tính',
  },
  STOCK_ATTRIBUTE_OPTION_INACTIVE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Option thuộc tính đã ngừng sử dụng',
  },
  STOCK_ATTRIBUTE_CODE_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Code đã tồn tại trong nhóm thuộc tính này',
  },
  STOCK_ATTRIBUTE_CODE_IMMUTABLE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Không thể sửa code của option đã được sử dụng',
  },
  STOCK_ATTRIBUTE_CATEGORY_CODE_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message:
      'Code không khớp với category nào trong sku-template registry của nhóm này',
  },
  STOCK_ITEM_BARCODE_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Barcode bị trùng, thử lại thao tác',
  },
} as const;

export type CommonErrorCode = keyof typeof ERROR_CATALOG;
