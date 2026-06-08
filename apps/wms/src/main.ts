import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/wms');
  await app.listen(process.env.WMS_PORT ?? 3001);
}
bootstrap();
