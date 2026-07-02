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
import { Category, CategorySchema } from './schemas/category.schema';
import { Product, ProductSchema } from './schemas/product.schema';
import { Design, DesignSchema } from './schemas/design.schema';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import {
  CatalogPublicController,
  CatalogAdminController,
  DesignController,
} from './catalog.controller';
import { StockConsumer } from './stock.consumer';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.STOCK }),
    MongooseModule.forFeature([
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: ProcessedEvent.name, schema: ProcessedEventSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: Design.name, schema: DesignSchema },
    ]),
  ],
  controllers: [
    CatalogPublicController,
    CatalogAdminController,
    DesignController,
  ],
  providers: [CatalogRepository, CatalogService, StockConsumer],
  exports: [CatalogService],
})
export class CatalogModule {}
