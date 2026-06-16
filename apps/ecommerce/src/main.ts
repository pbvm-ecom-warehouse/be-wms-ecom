import { ConfigService, ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp, setupSwagger } from '@app/common';
import { appConfig } from './config/app.config';
import { EcommerceModule } from './ecommerce.module';

async function bootstrap() {
  const app = await NestFactory.create(EcommerceModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const appCfg = config.get<ConfigType<typeof appConfig>>('app')!;

  setupApp(app, {
    corsOrigins: appCfg.corsOrigins,
    isProd: appCfg.env === 'production',
    globalPrefix: 'api/shop',
  });

  setupSwagger(app, {
    title: 'Ecommerce API',
    description: 'Bán hàng: auth khách, catalog, đơn hàng, thanh toán',
    docsPath: 'api/shop/docs',
    isProd: appCfg.env === 'production',
  });

  await app.listen(appCfg.port);
}
void bootstrap();
