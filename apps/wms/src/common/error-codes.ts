import { HttpStatus, type HttpStatus as HttpStatusType } from '@nestjs/common';

/**
 * Mã lỗi nghiệp vụ của WMS app.
 * Thêm code theo domain tại đây — không thêm vào libs/common.
 * Xem pattern: libs/common/src/errors/error-codes.ts
 *
 * Ví dụ domain sau:
 *   STOCK_INSUFFICIENT:     { status: HttpStatus.CONFLICT, message: '...' }
 *   SHIPMENT_ALREADY_SENT:  { status: HttpStatus.CONFLICT, message: '...' }
 *   PRINT_JOB_NOT_PENDING:  { status: HttpStatus.BAD_REQUEST, message: '...' }
 */
export const WMS_ERRORS = {
  // Warehouse
  WAREHOUSE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy kho',
  },
  WAREHOUSE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã khu vực đã tồn tại trong kho này',
  },
  // Zone
  ZONE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy khu vực',
  },
  ZONE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã khu vực đã tồn tại trong kho này',
  },
  // Rack
  RACK_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy kệ',
  },
  RACK_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã kệ đã tồn tại trong zone này',
  },
  // Shelf
  SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy tầng kệ',
  },
  SHELF_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã barcode tầng đã tồn tại',
  },
} as const satisfies Record<
  string,
  { status: HttpStatusType; message: string }
>;

export type WmsErrorCode = keyof typeof WMS_ERRORS;
