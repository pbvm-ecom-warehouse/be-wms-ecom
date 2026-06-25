import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';
import { PaginatedResult } from '../pagination/paginated-result';

/**
 * Bọc MỌI response thành công thành { data, meta: { requestId, timestamp } }.
 * - PaginatedResult → data=items, gộp pagination vào meta.
 * - @RawResponse → bỏ qua (webhook/callback).
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { id?: string }>();
    const requestId =
      req.id ?? (req.headers['x-request-id'] as string | undefined);

    return next.handle().pipe(
      map((payload) => {
        const meta: Record<string, unknown> = {
          requestId,
          timestamp: new Date().toISOString(),
        };
        if (payload instanceof PaginatedResult) {
          meta.pagination = payload.pagination;
          return { data: payload.items, meta };
        }
        const data: unknown = payload ?? null;
        return { data, meta };
      }),
    );
  }
}
