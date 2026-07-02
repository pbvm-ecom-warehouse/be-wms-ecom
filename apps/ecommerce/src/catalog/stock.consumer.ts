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

/**
 * CONSUMER tồn kho: cộng dồn ProductVariant.availableQty theo delta (bản copy do WMS
 * sync về, match theo sku). KHÔNG đọc wms_db.
 * Idempotency được encapsulate trong CatalogRepository.applyStockDeltaOnce.
 */
@Processor(QUEUES.STOCK)
export class StockConsumer extends WorkerHost {
  private readonly logger = new Logger(StockConsumer.name);

  constructor(private readonly catalogRepo: CatalogRepository) {
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
