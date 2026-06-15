import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppException } from '../errors/app.exception';

/** Map HTTP status (từ HttpException của Nest) → mã lỗi chuẩn. */
const STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

/**
 * Bắt MỌI exception → output chuẩn { error: { code, message, details? }, meta }.
 * Vì sao: FE switch theo error.code (ổn định) thay vì message; lỗi 5xx giấu chi tiết
 * khỏi client nhưng log full stack ở server kèm requestId để trace.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = req.id ?? (req.headers['x-request-id'] as string | undefined);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'Lỗi hệ thống';
    let details: unknown;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      const body = exception.getResponse() as { code: string; message: string; details?: unknown };
      code = body.code;
      message = body.message;
      details = body.details;
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'RATE_LIMITED';
      message = 'Quá nhiều yêu cầu, thử lại sau';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? 'INTERNAL';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: unknown };
        if (Array.isArray(b.message)) {
          message = 'Dữ liệu không hợp lệ';
          details = b.message;
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status} [reqId=${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      meta: { requestId, timestamp: new Date().toISOString(), path: req.url },
    });
  }
}
