import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventsModule } from '@app/events';
import { CatalogModule } from './catalog/catalog.module';
import { EcommerceController } from './ecommerce.controller';
import { EcommerceService } from './ecommerce.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, // → ecom_db
    EventsModule, // BullMQ + Redis
    CatalogModule, // consumer mẫu: stock.changed → availableQty
  ],
  controllers: [EcommerceController],
  providers: [EcommerceService],
})
export class EcommerceModule {}
