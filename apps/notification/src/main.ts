import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@app/common';
import { Env } from './config/env.validation';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);

  setupApp(app, {
    corsOrigins: undefined, // consumer thuần, không có FE gọi CORS
    isProd: config.get('NODE_ENV', { infer: true }) === 'production',
    globalPrefix: 'api/notification',
  });

  await app.listen(config.get('NOTIFICATION_PORT', { infer: true }));
}
void bootstrap();
