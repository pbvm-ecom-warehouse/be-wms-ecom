import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '@app/database';
import { EventsModule } from '@app/events';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { validateEnv } from './config/env.validation';
import { EcommerceController } from './ecommerce.controller';
import { EcommerceService } from './ecommerce.service';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Rate limit toàn cục (chống brute-force login khách, lạm dụng API): 100 req / 60s / IP.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule.forApp('ECOM_DATABASE_URL'), // Mongoose → ecom_db
    EventsModule, // BullMQ + Redis
    AuthModule, // đăng ký/đăng nhập khách (customers) + JWT
    HealthModule, // GET /api/shop/health
    CatalogModule, // consumer mẫu: stock.changed → availableQty
  ],
  controllers: [EcommerceController],
  providers: [
    EcommerceService,
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // áp throttle cho mọi route
  ],
})
export class EcommerceModule {}
