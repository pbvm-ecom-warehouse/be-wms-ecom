import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  EVENTS,
  QUEUES,
  type StockChangedPayload,
  type StockExpiredPayload,
  type WarehouseItemCreatedPayload,
} from '@app/events';
import { Job, Queue } from 'bullmq';
import { CatalogRepository } from './catalog.repository';

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
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notifyQueue: Queue,
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
        } else {
          this.logger.warn(
            `Job ${job.id} đã xử lý trước đó → bỏ qua (idempotent).`,
          );
        }
        break;
      }
      case EVENTS.ITEM_CREATED: {
        const payload = job.data as WarehouseItemCreatedPayload;
        // Chỉ đồng bộ các sản phẩm thuộc diện đăng bán lẻ trên Ecom
        if (payload.type === 'CUP_BLANK' || payload.type === 'CUP_PRINTED') {
          const attributesObj: Record<string, string> = {};
          if (Array.isArray(payload.attributes)) {
            for (const attr of payload.attributes) {
              attributesObj[attr.code.toLowerCase()] = attr.value;
            }
          }
          const applied = await this.catalogRepo.createProductVariantFromWms(
            String(job.id),
            job.name,
            payload.sku,
            payload.type,
            payload.initialQty || 0,
            attributesObj,
          );
          if (applied) {
            this.logger.log(
              `Tự động đồng bộ SKU [${payload.sku}] từ WMS sang Ecom dưới dạng Nháp thành công (job ${job.id})`,
            );
            // Bắn event báo cho Manager biết qua FCM Push
            await this.notifyQueue.add(
              EVENTS.NEW_ITEM_SYNCED,
              { sku: payload.sku, name: payload.name },
              { removeOnComplete: true },
            );
          } else {
            this.logger.warn(
              `Job ${job.id} cho SKU [${payload.sku}] đã xử lý trước đó → bỏ qua.`,
            );
          }
        } else {
          this.logger.log(
            `Bỏ qua đồng bộ SKU [${payload.sku}] vì loại mặt hàng [${payload.type}] không hiển thị bán lẻ trên Ecom.`,
          );
        }
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên stock-queue: ${job.name}`);
    }
  }
}
