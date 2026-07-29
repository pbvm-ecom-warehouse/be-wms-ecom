import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import { GoodsIssue, GoodsIssueSchema } from './schemas/goods-issue.schema';
import { GoodsIssueRepository } from './goods-issue.repository';
import { GoodsIssueService } from './goods-issue.service';
import { GoodsIssueController } from './goods-issue.controller';
import { OrderReadyConsumer } from './order-ready.consumer';
import { LocationModule } from '../location/location.module';
import { StockModule } from '../stock/stock.module';
import { DocumentNumberModule } from '../document-number/document-number.module';

@Module({
  imports: [
    // ORDER: consume order.ready_to_fulfill · SHIPMENT: produce goods.issued cho Ecom
    // (khớp apps/ecommerce/src/order/order.consumer.ts đang lắng nghe QUEUES.SHIPMENT)
    // SHIPMENT_INTERNAL: produce goods.issued cho GoodsIssuedConsumer nội bộ WMS
    // (tách khỏi SHIPMENT để tránh 2 worker cùng cạnh tranh 1 job — xem ORDER_REPLY)
    BullModule.registerQueue(
      { name: QUEUES.ORDER },
      { name: QUEUES.SHIPMENT },
      { name: QUEUES.SHIPMENT_INTERNAL },
    ),
    MongooseModule.forFeature([
      { name: GoodsIssue.name, schema: GoodsIssueSchema },
    ]),
    LocationModule, // findShelfByCode
    StockModule, // StockRepository + StockTransactionHelper
    DocumentNumberModule,
  ],
  providers: [GoodsIssueRepository, GoodsIssueService, OrderReadyConsumer],
  controllers: [GoodsIssueController],
  exports: [GoodsIssueService, GoodsIssueRepository],
})
export class GoodsIssueModule {}
