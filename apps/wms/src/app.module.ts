import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventsModule } from '@app/events';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { StockModule } from './stock/stock.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, // → wms_db
    EventsModule, // BullMQ + Redis
    StockModule, // producer mẫu: stock.changed
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
