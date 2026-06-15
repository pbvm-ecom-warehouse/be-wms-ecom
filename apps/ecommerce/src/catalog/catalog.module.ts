import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import {
  ProcessedEvent,
  ProcessedEventSchema,
} from './schemas/processed-event.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from './schemas/product-variant.schema';
import { StockConsumer } from './stock.consumer';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.STOCK }),
    MongooseModule.forFeature([
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: ProcessedEvent.name, schema: ProcessedEventSchema },
    ]),
  ],
  providers: [StockConsumer],
})
export class CatalogModule {}
