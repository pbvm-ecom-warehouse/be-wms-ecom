import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
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
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { StockModule } from './stock/stock.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { SupplierModule } from './supplier/supplier.module';
import { PurchaseOrderModule } from './purchase-order/purchase-order.module';
import { GoodsReceiptNoteModule } from './goods-receipt-note/goods-receipt-note.module';
import { PutAwaySuggestionModule } from './put-away-suggestion/put-away-suggestion.module';
import { GoodsIssueModule } from './goods-issue/goods-issue.module';
import { ReservationModule } from './reservation/reservation.module';
import { PrintJobModule } from './print-job/print-job.module';
import { StockCountModule } from './stock-count/stock-count.module';
import { ScrapNoteModule } from './scrap-note/scrap-note.module';
import { GoodsReturnModule } from './goods-return/goods-return.module';
import { ReportModule } from './report/report.module';
import { ShippingModule } from './shipping/shipping.module';
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
    CloudinaryModule, // upload ảnh dùng chung (GRN, GoodsReturn, ScrapNote, StockCount, avatar...)
    DatabaseModule.forApp('WMS_DATABASE_URL'), // Mongoose → wms_db
    EventsModule, // BullMQ + Redis
    ScheduleModule.forRoot(), // S4-04: cron NearExpiryScanService (06:00 quét lot sắp hết hạn)
    AuthModule, // đăng nhập nhân viên + JWT
    UsersModule, // CRUD nhân viên cho ADMIN/MANAGER (list/get/create/update/role/lock/unlock/reset-password/soft-delete)
    HealthModule, // GET /api/wms/health
    StockModule, // producer mẫu: stock.changed
    WarehouseModule, // CRUD cấu trúc kho: Warehouse/Zone/Rack/Shelf
    SupplierModule, // CRUD NCC + bảng giá SupplierItem
    PurchaseOrderModule, // UC-01: tạo/xem PO — dùng SupplierModule + WarehouseModule
    GoodsReceiptNoteModule, // UC-02: nhận hàng theo PO, cộng tồn 2 lớp — dùng PurchaseOrderModule + StockModule + WarehouseModule
    PutAwaySuggestionModule, // S2-05: gợi ý vị trí put-away theo thể tích — dùng StockModule + WarehouseModule
    GoodsIssueModule, // UC-05: nhận order.ready_to_fulfill, sinh GoodsIssue, PICKER xuất kho, phát goods.issued
    ReservationModule, // saga giữ tồn checkout: nhận stock.reserve_requested/order.cancelled, phát stock.reserved/stock.reserve_failed
    PrintJobModule, // UC-04: nhận print.requested, sinh PrintJob, PRINTER in ly make-to-order, phát print.completed
    StockCountModule, // UC-06: MANAGER tạo phiếu kiểm kho, COUNTER đếm thực, duyệt sinh ADJUST + stock.changed
    ScrapNoteModule, // UC-08: COUNTER/RECEIVER đề xuất hủy hàng hết hạn/hỏng, MANAGER duyệt/từ chối
    GoodsReturnModule, // UC-09: nhận order.returned, sinh GoodsReturn, RECEIVER inspect/confirm/cancel
    ReportModule, // S4-03: báo cáo tồn (theo SKU+kho, theo lô) + hiệu suất kho, read-only — [ADMIN, MANAGER]
    ShippingModule, // P7: carriers + shipments, auto-sinh sau goods.issued, phát shipment.shipped/delivered/returned
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // áp throttle cho mọi route
  ],
})
export class AppModule {}
