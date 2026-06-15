import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@app/common';
import { AppModule } from './app.module';
import { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);

  setupApp(app, {
    corsOrigins: config.get('WMS_CORS_ORIGINS', { infer: true }),
    isProd: config.get('NODE_ENV', { infer: true }) === 'production',
    globalPrefix: 'api/wms',
  });

  await app.listen(config.get('WMS_PORT', { infer: true }));
}
void bootstrap();
