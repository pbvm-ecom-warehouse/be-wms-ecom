import cookieParser from 'cookie-parser';
import { ConfigService, ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp, setupSwagger } from '@app/common';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const appCfg = config.get<ConfigType<typeof appConfig>>('app')!;

  // cookieParser phải chạy trước mọi guard để req.cookies sẵn sàng cho JwtStrategy.
  app.use(cookieParser());

  setupApp(app, {
    corsOrigins: appCfg.corsOrigins,
    isProd: appCfg.env === 'production',
    globalPrefix: 'api/wms',
  });

  setupSwagger(app, {
    title: 'WMS API',
    description:
      'Quản lý kho: auth nhân viên, tồn kho, xuất nhập, in ly, vận đơn',
    docsPath: 'api/wms/docs',
    isProd: appCfg.env === 'production',
  });

  await app.listen(appCfg.port);
}
void bootstrap();
