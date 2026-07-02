import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CATALOG } from './error-codes';

/** 1 dòng lỗi chi tiết (vd lỗi field từ validate). */
export interface ErrorDetail {
  field?: string;
  issue: string;
}

/**
 * Exception nghiệp vụ chuẩn: mang `code` chuỗi ổn định (FE switch-case không phụ
 * thuộc message tiếng Việt), message, details và HTTP status.
 * Nếu code nằm trong ERROR_CATALOG và không truyền status/message → dùng mặc định.
 */
export class AppException extends HttpException {
  readonly code: string;
  readonly details?: unknown;

  constructor(
    code: string,
    message?: string,
    status?: number,
    details?: unknown,
  ) {
    const fallback = (
      ERROR_CATALOG as Record<string, { status: number; message: string }>
    )[code];
    const resolvedStatus = status ?? fallback?.status ?? HttpStatus.BAD_REQUEST;
    const resolvedMessage = message ?? fallback?.message ?? code;
    super(
      {
        code,
        message: resolvedMessage,
        ...(details !== undefined ? { details } : {}),
      },
      resolvedStatus,
    );
    this.code = code;
    this.details = details;
  }
}
