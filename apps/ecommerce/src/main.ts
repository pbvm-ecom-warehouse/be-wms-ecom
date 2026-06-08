import { NestFactory } from '@nestjs/core';
import { EcommerceModule } from './ecommerce.module';

async function bootstrap() {
  const app = await NestFactory.create(EcommerceModule);
  app.setGlobalPrefix('api/shop');
  await app.listen(process.env.ECOM_PORT ?? 3002);
}
bootstrap();
