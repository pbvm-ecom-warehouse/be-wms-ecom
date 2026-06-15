import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '@app/common';
import helmet from 'helmet';
import { Env } from './config/env.validation';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  app.setGlobalPrefix('api/notification');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks(); // đóng kết nối BullMQ sạch khi tắt

  await app.listen(config.get('NOTIFICATION_PORT', { infer: true }));
}
void bootstrap();
