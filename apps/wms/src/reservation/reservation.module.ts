import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@app/events';
import { ReservationService } from './reservation.service';
import { ReservationConsumer } from './reservation.consumer';
import { StockModule } from '../stock/stock.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { GoodsIssueModule } from '../goods-issue/goods-issue.module';

@Module({
  imports: [
    // ORDER: consume stock.reserve_requested + order.cancelled
    BullModule.registerQueue({ name: QUEUES.ORDER }),
    StockModule, // StockRepository + StockTransactionHelper
    WarehouseModule, // findAllActiveWarehouseIds + findStagingShelfByWarehouse
    GoodsIssueModule, // GoodsIssueRepository — kiểm tra GoodsIssue tồn tại trước khi release
  ],
  providers: [ReservationService, ReservationConsumer],
  exports: [ReservationService],
})
export class ReservationModule {}
