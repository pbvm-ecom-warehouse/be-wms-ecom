import { HttpStatus } from '@nestjs/common';

/**
 * Mã lỗi nghiệp vụ của Ecommerce app.
 * Thêm code theo domain tại đây — không thêm vào libs/common.
 * Xem pattern: libs/common/src/errors/error-codes.ts
 *
 * Ví dụ domain sau:
 *   CATALOG_PRODUCT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: '...' }
 *   ORDER_NOT_CANCELLABLE:     { status: HttpStatus.CONFLICT, message: '...' }
 *   PAYMENT_FAILED:            { status: HttpStatus.BAD_REQUEST, message: '...' }
 */
export const ECOM_ERRORS = {
  // domain codes sẽ thêm vào đây khi implement từng module
} as const satisfies Record<string, { status: number; message: string }>;

export type EcomErrorCode = keyof typeof ECOM_ERRORS;
