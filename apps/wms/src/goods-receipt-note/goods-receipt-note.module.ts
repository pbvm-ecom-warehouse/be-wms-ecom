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
import { WarehouseModule } from '../warehouse/warehouse.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoodsReceiptNote.name, schema: GoodsReceiptNoteSchema },
    ]),
    PurchaseOrderModule, // getPurchaseOrder + applyReceivedQty
    WarehouseModule, // findStagingShelf
    StockModule, // StockRepository/StockService/StockTransactionHelper — cộng tồn 2 lớp
  ],
  providers: [GoodsReceiptNoteRepository, GoodsReceiptNoteService],
  controllers: [GoodsReceiptNoteController],
})
export class GoodsReceiptNoteModule {}
