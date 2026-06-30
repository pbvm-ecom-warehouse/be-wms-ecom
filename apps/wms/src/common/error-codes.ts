import type { HttpStatus as HttpStatusType } from '@nestjs/common';

/**
 * Mã lỗi nghiệp vụ của WMS app.
 * Thêm code theo domain tại đây — không thêm vào libs/common.
 * Xem pattern: libs/common/src/errors/error-codes.ts
 *
 * Ví dụ domain sau:
 *   STOCK_INSUFFICIENT:     { status: HttpStatus.CONFLICT, message: '...' }
 *   SHIPMENT_ALREADY_SENT:  { status: HttpStatus.CONFLICT, message: '...' }
 *   PRINT_JOB_NOT_PENDING:  { status: HttpStatus.BAD_REQUEST, message: '...' }
 *
 * Lưu ý: Warehouse structure codes (WAREHOUSE_*, ZONE_*, RACK_*, SHELF_*)
 * đã được di chuyển vào libs/common/src/errors/error-codes.ts tại ERROR_CATALOG
 * (cross-cutting infrastructure).
 */
export const WMS_ERRORS = {} as const satisfies Record<
  string,
  { status: HttpStatusType; message: string }
>;

export type WmsErrorCode = keyof typeof WMS_ERRORS;
