import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  AllExceptionsFilter,
  LoggingInterceptor,
  buildCorsOptions,
} from '@app/common';
import helmet from 'helmet';
import { Env } from './config/env.validation';
import { EcommerceModule } from './ecommerce.module';

async function bootstrap() {
  const app = await NestFactory.create(EcommerceModule);
  const config = app.get(ConfigService<Env, true>);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  app.use(helmet()); // security header
  // CORS whitelist theo env (chặn allow-all kèm credentials ở prod).
  app.enableCors(
    buildCorsOptions(config.get('ECOM_CORS_ORIGINS', { infer: true }), isProd),
  );
  app.setGlobalPrefix('api/shop');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // loại field không khai báo trong DTO
      forbidNonWhitelisted: true, // báo lỗi nếu gửi field lạ
      transform: true, // tự ép kiểu theo DTO
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter()); // chuẩn hóa lỗi, giấu stack 5xx
  app.useGlobalInterceptors(new LoggingInterceptor()); // log mỗi request
  app.enableShutdownHooks(); // để Mongoose/BullMQ đóng kết nối sạch khi tắt app

  await app.listen(config.get('ECOM_PORT', { infer: true }));
}
void bootstrap();
