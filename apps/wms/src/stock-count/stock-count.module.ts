import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import { StockCount, StockCountSchema } from './schemas/stock-count.schema';
import { StockCountRepository } from './stock-count.repository';
import { StockCountService } from './stock-count.service';
import { StockCountController } from './stock-count.controller';
import { LocationModule } from '../location/location.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    // STOCK: produce stock.changed sau khi approve (available đổi qua onHand)
    BullModule.registerQueue({ name: QUEUES.STOCK }),
    MongooseModule.forFeature([
      { name: StockCount.name, schema: StockCountSchema },
    ]),
    LocationModule, // findZoneById/findShelfIdsByZone
    StockModule, // StockRepository + StockTransactionHelper
  ],
  providers: [StockCountRepository, StockCountService],
  controllers: [StockCountController],
  exports: [StockCountService],
})
export class StockCountModule {}
