// apps/wms/src/purchase-order/purchase-order.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './schemas/purchase-order.schema';
import { PurchaseOrderRepository } from './purchase-order.repository';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderController } from './purchase-order.controller';
import { SupplierModule } from '../supplier/supplier.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
    ]),
    SupplierModule, // assertSupplierActive + getSupplierItemByItemAndSupplier
    // forwardRef: StockService cần hasAnyPurchaseOrderForItem để khóa depth/width/height,
    // trong khi PurchaseOrderService cần StockRepository.findItemById — 2 chiều phụ thuộc lẫn nhau.
    forwardRef(() => StockModule),
  ],
  providers: [PurchaseOrderRepository, PurchaseOrderService],
  controllers: [PurchaseOrderController],
  exports: [PurchaseOrderService], // GRN (S2-03) cần applyReceivedQty + getPurchaseOrder
})
export class PurchaseOrderModule {}
