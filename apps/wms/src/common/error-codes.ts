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
} as const satisfies Record<
  string,
  { status: HttpStatusType; message: string }
>;

export type WmsErrorCode = keyof typeof WMS_ERRORS;
