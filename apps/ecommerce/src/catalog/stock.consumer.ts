import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  EVENTS,
  QUEUES,
  type StockChangedPayload,
  type StockExpiredPayload,
} from '@app/events';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ví dụ CONSUMER: Catalog (Ecommerce) lắng nghe stock-queue và cộng dồn
 * ProductVariant.availableQty theo delta — bản copy tồn do WMS sync về (match theo sku).
 * KHÔNG đọc wms_db; chỉ dựa trên payload event.
 */
@Processor(QUEUES.STOCK)
export class StockConsumer extends WorkerHost {
  private readonly logger = new Logger(StockConsumer.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.STOCK_CHANGED: {
        const { sku, delta } = job.data as StockChangedPayload;
        await this.applyDelta(sku, delta);
        break;
      }
      case EVENTS.STOCK_EXPIRED: {
        const { sku, delta } = job.data as StockExpiredPayload;
        await this.applyDelta(sku, delta);
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên stock-queue: ${job.name}`);
    }
  }

  /** Cộng dồn availableQty cho mọi variant có cùng sku. */
  private async applyDelta(sku: string, delta: number): Promise<void> {
    const res = await this.prisma.productVariant.updateMany({
      where: { sku },
      data: { availableQty: { increment: delta } },
    });
    this.logger.log(
      `availableQty[${sku}] += ${delta} (cập nhật ${res.count} variant)`,
    );
  }
}
