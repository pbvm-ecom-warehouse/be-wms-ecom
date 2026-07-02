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
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { StockModule } from './stock/stock.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { SupplierModule } from './supplier/supplier.module';
import { PurchaseOrderModule } from './purchase-order/purchase-order.module';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { validateEnv } from './config/env.validation';

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
    DatabaseModule.forApp('WMS_DATABASE_URL'), // Mongoose → wms_db
    EventsModule, // BullMQ + Redis
    AuthModule, // đăng nhập nhân viên (users) + JWT
    HealthModule, // GET /api/wms/health
    StockModule, // producer mẫu: stock.changed
    WarehouseModule, // CRUD cấu trúc kho: Warehouse/Zone/Rack/Shelf
    SupplierModule, // CRUD NCC + bảng giá SupplierItem
    PurchaseOrderModule, // UC-01: tạo/xem PO — dùng SupplierModule + WarehouseModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // áp throttle cho mọi route
  ],
})
export class AppModule {}
