import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import { sanitizeForLog } from './sanitize';

/**
 * Cấu hình nestjs-pino dùng chung cho mọi app:
 * - genReqId: đọc X-Request-Id của client hoặc sinh UUID, set lại vào response header.
 *   requestId này dùng cho envelope { meta.requestId } và error → trace 1 request.
 * - redact: che header/body nhạy cảm.
 * - serializer req: log method/url/body (đã sanitize).
 * - dev: pino-pretty; prod: JSON 1 dòng.
 */
export function buildPinoOptions(config: ConfigService): Params {
  const level = config.get<string>('LOG_LEVEL') ?? 'info';

  return {
    pinoHttp: {
      level,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const existing =
          (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('X-Request-Id', existing);
        return existing;
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.refreshToken',
          'req.body.token',
          'req.body.otp',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req(req: IncomingMessage & { id?: string; raw?: { body?: unknown } }) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            body: sanitizeForLog(req.raw?.body),
          };
        },
      },
      transport: {
        target: 'pino-pretty',
        options: { singleLine: true, translateTime: 'SYS:standard' },
      },
    },
  };
}
