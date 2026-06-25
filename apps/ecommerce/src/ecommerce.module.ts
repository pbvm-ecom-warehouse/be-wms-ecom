import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import {
  CommonModule,
  buildPinoOptions,
  buildThrottlerOptions,
} from '@app/common';
import { DatabaseModule } from '@app/database';
import { EventsModule } from '@app/events';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
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
    DatabaseModule.forApp('ECOM_DATABASE_URL'), // Mongoose → ecom_db
    EventsModule, // BullMQ + Redis
    AuthModule, // đăng ký/đăng nhập khách (customers) + JWT
    HealthModule, // GET /api/shop/health
    CatalogModule, // consumer mẫu: stock.changed → availableQty
  ],
  controllers: [EcommerceController],
  providers: [
    EcommerceService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class EcommerceModule {}
