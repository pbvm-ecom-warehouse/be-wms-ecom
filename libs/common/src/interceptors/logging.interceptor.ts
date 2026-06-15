import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Interceptor log mỗi request HTTP: method, url, status, thời gian xử lý.
 * Đủ để quan sát traffic cơ bản; khi cần trace saga xuyên app hãy nâng lên
 * structured logging (nestjs-pino) + correlation id.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context
          .switchToHttp()
          .getResponse<{ statusCode: number }>();
        this.logger.log(
          `${method} ${url} ${res.statusCode} +${Date.now() - start}ms`,
        );
      }),
    );
  }
}
