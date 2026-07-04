import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  EVENTS,
  QUEUES,
  type StockChangedPayload,
  type StockExpiredPayload,
} from '@app/events';
import { Job } from 'bullmq';
import { CatalogRepository } from './catalog.repository';
import { CacheService } from '../cache/cache.service';

/**
 * CONSUMER tồn kho: cộng dồn ProductVariant.availableQty theo delta (bản copy do WMS
 * sync về, match theo sku). KHÔNG đọc wms_db.
 * Idempotency được encapsulate trong CatalogRepository.applyStockDeltaOnce.
 */
@Processor(QUEUES.STOCK)
export class StockConsumer extends WorkerHost {
  private readonly logger = new Logger(StockConsumer.name);

  constructor(
    private readonly catalogRepo: CatalogRepository,
    private readonly cacheService: CacheService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.STOCK_CHANGED:
      case EVENTS.STOCK_EXPIRED: {
        const { sku, delta } = job.data as
          | StockChangedPayload
          | StockExpiredPayload;
        const applied = await this.catalogRepo.applyStockDeltaOnce(
          String(job.id),
          job.name,
          sku,
          delta,
        );
        if (applied) {
          this.logger.log(`availableQty[${sku}] += ${delta} (job ${job.id})`);
          try {
            const variant = await this.catalogRepo.findVariantBySku(sku);
            if (variant) {
              const product = await this.catalogRepo.getProductById(variant.productId.toString());
              if (product) {
                await this.cacheService.del(`ecom:catalog:products:detail:${product.slug}`);
              }
            }
          } catch (cacheErr) {
            this.logger.error(`Lỗi khi xóa cache chi tiết sản phẩm cho SKU ${sku}:`, cacheErr);
          }
        } else {
          this.logger.warn(
            `Job ${job.id} đã xử lý trước đó → bỏ qua (idempotent).`,
          );
        }
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên stock-queue: ${job.name}`);
    }
  }
}
