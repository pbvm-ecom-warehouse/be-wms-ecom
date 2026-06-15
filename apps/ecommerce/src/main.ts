import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp, setupSwagger } from '@app/common';
import { Env } from './config/env.validation';
import { EcommerceModule } from './ecommerce.module';

async function bootstrap() {
  const app = await NestFactory.create(EcommerceModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  setupApp(app, {
    corsOrigins: config.get('ECOM_CORS_ORIGINS', { infer: true }),
    isProd,
    globalPrefix: 'api/shop',
  });

  setupSwagger(app, {
    title: 'Ecommerce API',
    description: 'Bán hàng: auth khách, catalog, đơn hàng, thanh toán',
    docsPath: 'api/shop/docs',
    isProd,
  });

  await app.listen(config.get('ECOM_PORT', { infer: true }));
}
void bootstrap();
