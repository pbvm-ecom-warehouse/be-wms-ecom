import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import { GoodsReturn, GoodsReturnSchema } from './schemas/goods-return.schema';
import { GoodsReturnRepository } from './goods-return.repository';
import { GoodsReturnService } from './goods-return.service';
import { GoodsReturnController } from './goods-return.controller';
import { OrderReturnedConsumer } from './order-returned.consumer';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { StockModule } from '../stock/stock.module';
import { ScrapNoteModule } from '../scrap-note/scrap-note.module';

@Module({
  imports: [
    // ORDER: consume order.returned · STOCK: produce stock.changed cho dòng GOOD
    BullModule.registerQueue({ name: QUEUES.ORDER }, { name: QUEUES.STOCK }),
    MongooseModule.forFeature([
      { name: GoodsReturn.name, schema: GoodsReturnSchema },
    ]),
    WarehouseModule, // findWarehouseById/findShelfById
    StockModule, // StockRepository + StockTransactionHelper
    ScrapNoteModule, // createApprovedScrapNoteForReturn (dòng DAMAGED)
  ],
  providers: [GoodsReturnRepository, GoodsReturnService, OrderReturnedConsumer],
  controllers: [GoodsReturnController],
  exports: [GoodsReturnService],
})
export class GoodsReturnModule {}
