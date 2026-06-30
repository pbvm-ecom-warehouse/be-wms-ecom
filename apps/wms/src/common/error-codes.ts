import { HttpStatus } from '@nestjs/common';
import type { HttpStatus as HttpStatusType } from '@nestjs/common';

/**
 * Mã lỗi nghiệp vụ của WMS app.
 * Thêm code theo domain tại đây — không thêm vào libs/common.
 * Xem pattern: libs/common/src/errors/error-codes.ts
 *
 * Lưu ý: Warehouse structure codes (WAREHOUSE_*, ZONE_*, RACK_*, SHELF_*)
 * đã được di chuyển vào libs/common/src/errors/error-codes.ts tại ERROR_CATALOG
 * (cross-cutting infrastructure).
 */
export const WMS_ERRORS = {
  STOCK_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng trong kho',
  },
  STOCK_INSUFFICIENT: {
    status: HttpStatus.CONFLICT,
    message: 'Số lượng tồn kho không đủ',
  },
  LOT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lô hàng',
  },
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
} as const satisfies Record<
  string,
  { status: HttpStatusType; message: string }
>;

export type WmsErrorCode = keyof typeof WMS_ERRORS;
