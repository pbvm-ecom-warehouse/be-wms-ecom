import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@app/events';
import { StockConsumer } from './stock.consumer';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.STOCK })],
  providers: [StockConsumer],
})
export class CatalogModule {}
