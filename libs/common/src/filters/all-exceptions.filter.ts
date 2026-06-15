import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Filter bắt MỌI exception và trả về một shape JSON nhất quán cho client.
 *
 * Vì sao cần: mặc định NestJS để lỗi không phải HttpException rò stack/thông tin
 * nội bộ ra response (500 kèm message thật). Filter này chuẩn hóa output và
 * giấu chi tiết lỗi 5xx khỏi client (chỉ log ở server).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // HttpException: lấy message do app chủ động ném. Lỗi khác: giấu chi tiết.
    let message: unknown = 'Internal server error';
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: unknown }).message ?? body);
    }

    // Lỗi 5xx luôn log đầy đủ ở server để truy vết (client không thấy).
    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      statusCode: status,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
