import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@app/common';
import { Env } from './config/env.validation';
import { EcommerceModule } from './ecommerce.module';

async function bootstrap() {
  const app = await NestFactory.create(EcommerceModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);

  setupApp(app, {
    corsOrigins: config.get('ECOM_CORS_ORIGINS', { infer: true }),
    isProd: config.get('NODE_ENV', { infer: true }) === 'production',
    globalPrefix: 'api/shop',
  });

  await app.listen(config.get('ECOM_PORT', { infer: true }));
}
void bootstrap();
