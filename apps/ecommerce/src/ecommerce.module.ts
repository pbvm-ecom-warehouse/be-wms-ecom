import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import {
  CloudinaryModule,
  CommonModule,
  buildPinoOptions,
  buildThrottlerOptions,
} from '@app/common';
import { DatabaseModule } from '@app/database';
import { EventsModule } from '@app/events';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { OrderModule } from './order/order.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { validateEnv } from './config/env.validation';
import { EcommerceController } from './ecommerce.controller';
import { EcommerceService } from './ecommerce.service';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [authConfig, appConfig],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildPinoOptions(config),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildThrottlerOptions(config),
    }),
    CommonModule, // global filter/interceptor/pipe
    CloudinaryModule, // upload ảnh dùng chung (product images, design, avatar...)
    DatabaseModule.forApp('ECOM_DATABASE_URL'), // Mongoose → ecom_db
    EventsModule, // BullMQ + Redis
    AuthModule, // đăng ký/đăng nhập khách (customers) + JWT
    HealthModule, // GET /api/shop/health
    CatalogModule, // consumer mẫu: stock.changed → availableQty
    CartModule,
    OrderModule,
    AnalyticsModule,
  ],
  controllers: [EcommerceController],
  providers: [
    EcommerceService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class EcommerceModule {}
