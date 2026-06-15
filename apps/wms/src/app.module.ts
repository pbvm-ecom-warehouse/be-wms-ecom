import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '@app/database';
import { EventsModule } from '@app/events';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { StockModule } from './stock/stock.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Rate limit toàn cục (chống brute-force login, lạm dụng API): 100 req / 60s / IP.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule.forApp('WMS_DATABASE_URL'), // Mongoose → wms_db
    EventsModule, // BullMQ + Redis
    AuthModule, // đăng nhập nhân viên (users) + JWT
    HealthModule, // GET /api/wms/health
    StockModule, // producer mẫu: stock.changed
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // áp throttle cho mọi route
  ],
})
export class AppModule {}
