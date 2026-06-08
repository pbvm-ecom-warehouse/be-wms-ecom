import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@app/events';
import { StockService } from './stock.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.STOCK })],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
