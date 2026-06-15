import { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { buildCorsOptions } from '../cors';

export interface SetupAppOptions {
  /** Danh sách origin CORS (CSV từ *_CORS_ORIGINS). */
  corsOrigins: string | undefined;
  isProd: boolean;
  /** Prefix toàn cục, vd 'api/wms'. */
  globalPrefix: string;
}

/**
 * Wiring chung mọi app: dùng pino làm logger Nest, helmet, CORS whitelist, prefix,
 * shutdown hooks. ValidationPipe/Filter/ResponseInterceptor đăng ký qua CommonModule
 * (cần DI) nên KHÔNG đặt ở đây.
 */
export function setupApp(app: INestApplication, opts: SetupAppOptions): void {
  app.useLogger(app.get(Logger)); // Nest log đi qua pino
  app.use(helmet());
  app.enableCors(buildCorsOptions(opts.corsOrigins, opts.isProd));
  app.setGlobalPrefix(opts.globalPrefix);
  app.enableShutdownHooks();
}
