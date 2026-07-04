import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
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
import { StockTransactionHelper } from './helpers/with-stock-transaction.helper';
import { StockController } from './stock.controller';
import { StockRepository } from './stock.repository';
import { StockService } from './stock.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.STOCK }),
    MongooseModule.forFeature([
      { name: WarehouseItem.name, schema: WarehouseItemSchema },
      { name: StockBalance.name, schema: StockBalanceSchema },
      { name: InventoryStock.name, schema: InventoryStockSchema },
      { name: Lot.name, schema: LotSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  controllers: [StockController],
  providers: [StockRepository, StockService, StockTransactionHelper],
  exports: [StockService, StockTransactionHelper, StockRepository],
})
export class StockModule {}
