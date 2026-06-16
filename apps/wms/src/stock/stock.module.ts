import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import {
  WarehouseItem,
  WarehouseItemSchema,
} from './schemas/warehouse-item.schema';
import { StockRepository } from './stock.repository';
import { StockService } from './stock.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.STOCK }),
    MongooseModule.forFeature([
      { name: WarehouseItem.name, schema: WarehouseItemSchema },
    ]),
  ],
  providers: [StockRepository, StockService],
  exports: [StockService],
})
export class StockModule {}
