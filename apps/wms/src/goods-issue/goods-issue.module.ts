import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import { GoodsIssue, GoodsIssueSchema } from './schemas/goods-issue.schema';
import { GoodsIssueRepository } from './goods-issue.repository';
import { GoodsIssueService } from './goods-issue.service';
import { GoodsIssueController } from './goods-issue.controller';
import { OrderReadyConsumer } from './order-ready.consumer';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    // ORDER: consume order.ready_to_fulfill · SHIPMENT: produce goods.issued
    // (khớp apps/ecommerce/src/order/order.consumer.ts đang lắng nghe QUEUES.SHIPMENT)
    BullModule.registerQueue({ name: QUEUES.ORDER }, { name: QUEUES.SHIPMENT }),
    MongooseModule.forFeature([
      { name: GoodsIssue.name, schema: GoodsIssueSchema },
    ]),
    WarehouseModule, // findShelfByCode
    StockModule, // StockRepository + StockTransactionHelper
  ],
  providers: [GoodsIssueRepository, GoodsIssueService, OrderReadyConsumer],
  controllers: [GoodsIssueController],
  exports: [GoodsIssueService, GoodsIssueRepository],
})
export class GoodsIssueModule {}
