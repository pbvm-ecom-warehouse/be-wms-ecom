import { HttpStatus } from '@nestjs/common';

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
  // domain codes sẽ thêm vào đây khi implement từng module
} as const satisfies Record<string, { status: number; message: string }>;

export type WmsErrorCode = keyof typeof WMS_ERRORS;
