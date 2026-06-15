import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp, setupSwagger } from '@app/common';
import { AppModule } from './app.module';
import { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  setupApp(app, {
    corsOrigins: config.get('WMS_CORS_ORIGINS', { infer: true }),
    isProd,
    globalPrefix: 'api/wms',
  });

  setupSwagger(app, {
    title: 'WMS API',
    description: 'Quản lý kho: auth nhân viên, tồn kho, xuất nhập, in ly, vận đơn',
    docsPath: 'api/wms/docs',
    isProd,
  });

  await app.listen(config.get('WMS_PORT', { infer: true }));
}
void bootstrap();
