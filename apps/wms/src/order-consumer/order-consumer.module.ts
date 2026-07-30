import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@app/events';
import { ReservationModule } from '../reservation/reservation.module';
import { GoodsIssueModule } from '../goods-issue/goods-issue.module';
import { GoodsReturnModule } from '../goods-return/goods-return.module';
import { OrderConsumer } from './order-consumer';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.ORDER }),
    ReservationModule,
    GoodsIssueModule,
    GoodsReturnModule,
  ],
  providers: [OrderConsumer],
})
export class OrderConsumerModule {}
