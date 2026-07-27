// apps/wms/src/supplier/supplier.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Supplier, SupplierSchema } from './schemas/supplier.schema';
import {
  SupplierItem,
  SupplierItemSchema,
} from './schemas/supplier-item.schema';
import { SupplierRepository } from './supplier.repository';
import { SupplierService } from './supplier.service';
import { SupplierController } from './supplier.controller';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: SupplierItem.name, schema: SupplierItemSchema },
    ]),
    StockModule, // findItemsByIds — gắn sku/itemName vào SupplierItem response
  ],
  providers: [SupplierRepository, SupplierService],
  controllers: [SupplierController],
  exports: [SupplierService], // module PO dùng assertSupplierActive khi xác nhận PO
})
export class SupplierModule {}
