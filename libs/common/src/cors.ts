import { Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return origin.replace(/\/+$/, '');
  }
}

function originPatternMatches(pattern: string, origin: string): boolean {
  if (!pattern.endsWith(':*')) return pattern === origin;

  try {
    const patternUrl = new URL(pattern.slice(0, -2));
    const originUrl = new URL(origin);
    return (
      patternUrl.protocol === originUrl.protocol &&
      patternUrl.hostname === originUrl.hostname
    );
  } catch {
    return false;
  }
}

/**
 * Dựng cấu hình CORS an toàn dùng chung cho mọi app.
 *
 * Vì sao không để `origin: true` + `credentials: true`: cấu hình đó phản chiếu
 * *mọi* origin kèm cookie/credentials = allow-all, là lỗ hổng khi production.
 *
 * - `originsCsv`: danh sách origin được phép, ngăn cách dấu phẩy (từ *_CORS_ORIGINS).
 * - `isProd`: ở production mà không khai báo origin → ném lỗi (fail fast), không
 *   âm thầm mở toang. Ở dev mà để trống → cho phản chiếu mọi origin cho tiện.
 */
export function buildCorsOptions(
  originsCsv: string | undefined,
  isProd: boolean,
): CorsOptions {
  const logger = new Logger('CORS');
  const origins = (originsCsv ?? '')
    .split(',')
    .map((o) => normalizeOrigin(o.trim()))
    .filter(Boolean);

  if (origins.length === 0) {
    if (isProd) {
      throw new Error(
        'CORS: production bắt buộc khai báo *_CORS_ORIGINS (danh sách origin được phép). ' +
          'Không cho phép allow-all kèm credentials.',
      );
    }
    logger.warn(
      'Không có *_CORS_ORIGINS → DEV mode: phản chiếu mọi origin. Hãy khai báo trước khi lên prod.',
    );
    return { origin: true, credentials: true };
  }

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      const allowed = origins.some((allowedOrigin) =>
        originPatternMatches(allowedOrigin, normalizedOrigin),
      );

      callback(null, allowed);
    },
    credentials: true,
  };
}
