// apps/wms/src/goods-receipt-note/goods-receipt-note.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GoodsReceiptNote,
  GoodsReceiptNoteSchema,
} from './schemas/goods-receipt-note.schema';
import { GoodsReceiptNoteRepository } from './goods-receipt-note.repository';
import { GoodsReceiptNoteService } from './goods-receipt-note.service';
import { GoodsReceiptNoteController } from './goods-receipt-note.controller';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { LocationModule } from '../location/location.module';
import { StockModule } from '../stock/stock.module';
import { PutAwayModule } from '../put-away/put-away.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoodsReceiptNote.name, schema: GoodsReceiptNoteSchema },
    ]),
    PurchaseOrderModule, // getPurchaseOrder + applyReceivedQty
    LocationModule, // findStagingShelf
    StockModule, // StockRepository/StockService/StockTransactionHelper — cộng tồn 2 lớp
    PutAwayModule, // createTaskFromGrn — sinh việc put-away khi GRN CONFIRMED
  ],
  providers: [GoodsReceiptNoteRepository, GoodsReceiptNoteService],
  controllers: [GoodsReceiptNoteController],
})
export class GoodsReceiptNoteModule {}
