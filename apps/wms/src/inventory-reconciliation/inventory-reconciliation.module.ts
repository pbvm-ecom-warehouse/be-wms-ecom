import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockModule } from '../stock/stock.module';
import { LocationModule } from '../location/location.module';
import {
  InventoryCellAssignment,
  InventoryCellAssignmentSchema,
} from './schemas/inventory-cell-assignment.schema';
import { InventoryReconciliationController } from './inventory-reconciliation.controller';
import { InventoryReconciliationService } from './inventory-reconciliation.service';

@Module({
  imports: [
    StockModule,
    LocationModule,
    MongooseModule.forFeature([
      {
        name: InventoryCellAssignment.name,
        schema: InventoryCellAssignmentSchema,
      },
    ]),
  ],
  controllers: [InventoryReconciliationController],
  providers: [InventoryReconciliationService],
})
export class InventoryReconciliationModule {}
