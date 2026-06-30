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
} as const satisfies Record<string, { status: HttpStatusType; message: string }>;

export type WmsErrorCode = keyof typeof WMS_ERRORS;
