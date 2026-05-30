import { NestFactory } from '@nestjs/core';
import { EcommerceModule } from './ecommerce.module';

async function bootstrap() {
  const app = await NestFactory.create(EcommerceModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
