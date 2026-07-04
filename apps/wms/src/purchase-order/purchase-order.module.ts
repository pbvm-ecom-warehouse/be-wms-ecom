// apps/wms/src/purchase-order/purchase-order.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './schemas/purchase-order.schema';
import { PurchaseOrderRepository } from './purchase-order.repository';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderController } from './purchase-order.controller';
import { SupplierModule } from '../supplier/supplier.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
    ]),
    SupplierModule, // assertSupplierActive + getSupplierItemByItemId
    WarehouseModule, // getWarehouse
    StockModule, // findItemById — validate itemId tồn tại khi tạo PO
  ],
  providers: [PurchaseOrderRepository, PurchaseOrderService],
  controllers: [PurchaseOrderController],
  exports: [PurchaseOrderService], // GRN (S2-03) cần applyReceivedQty + getPurchaseOrder
})
export class PurchaseOrderModule {}
