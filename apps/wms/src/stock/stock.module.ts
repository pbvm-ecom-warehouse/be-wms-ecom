import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import {
  InventoryStock,
  InventoryStockSchema,
} from './schemas/inventory-stock.schema';
import { Lot, LotSchema } from './schemas/lot.schema';
import {
  StockBalance,
  StockBalanceSchema,
} from './schemas/stock-balance.schema';
import {
  StockMovement,
  StockMovementSchema,
} from './schemas/stock-movement.schema';
import {
  WarehouseItem,
  WarehouseItemSchema,
} from './schemas/warehouse-item.schema';
import {
  ItemAttributeOption,
  ItemAttributeOptionSchema,
} from './schemas/attribute-option.schema';
import {
  BarcodeCounter,
  BarcodeCounterSchema,
} from './schemas/barcode-counter.schema';
import {
  BarcodeRegistryEntry,
  BarcodeRegistryEntrySchema,
} from './schemas/barcode-registry.schema';
import { ExpiredLotScanService } from './expired-lot-scan.service';
import { StockTransactionHelper } from './helpers/with-stock-transaction.helper';
import { NearExpiryScanService } from './near-expiry-scan.service';
import { StockController } from './stock.controller';
import { StockRepository } from './stock.repository';
import { StockService } from './stock.service';
import { AttributeOptionController } from './attribute-option/attribute-option.controller';
import { AttributeOptionRepository } from './attribute-option/attribute-option.repository';
import { AttributeOptionService } from './attribute-option/attribute-option.service';
import { SkuTemplateController } from './sku/sku-template.controller';
import { SkuTemplateService } from './sku/sku-template.service';
import { BarcodeRepository } from './barcode/barcode.repository';
import { BarcodeService } from './barcode/barcode.service';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.STOCK },
      { name: QUEUES.NOTIFICATION }, // S4-04: StockService.checkAndEmitStockLow → stock.low
    ),
    // forwardRef: PurchaseOrderModule cũng import StockModule (findItemById) — xem purchase-order.module.ts.
    forwardRef(() => PurchaseOrderModule),
    MongooseModule.forFeature([
      { name: WarehouseItem.name, schema: WarehouseItemSchema },
      { name: StockBalance.name, schema: StockBalanceSchema },
      { name: InventoryStock.name, schema: InventoryStockSchema },
      { name: Lot.name, schema: LotSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: ItemAttributeOption.name, schema: ItemAttributeOptionSchema },
      { name: BarcodeCounter.name, schema: BarcodeCounterSchema },
      { name: BarcodeRegistryEntry.name, schema: BarcodeRegistryEntrySchema },
    ]),
  ],
  controllers: [
    StockController,
    AttributeOptionController,
    SkuTemplateController,
  ],
  providers: [
    StockRepository,
    StockService,
    StockTransactionHelper,
    NearExpiryScanService, // S4-04: cron 06:00 quét lot sắp hết hạn → stock.near_expiry
    ExpiredLotScanService, // cron 07:00 quét lot ĐÃ hết hạn → tăng expired + stock.expired (issue #7)
    AttributeOptionRepository,
    AttributeOptionService,
    SkuTemplateService,
    BarcodeRepository,
    BarcodeService,
  ],
  exports: [
    StockService,
    StockTransactionHelper,
    StockRepository,
    BarcodeService,
  ],
})
export class StockModule {}
