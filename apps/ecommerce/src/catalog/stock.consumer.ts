import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  EVENTS,
  QUEUES,
  type StockChangedPayload,
  type StockExpiredPayload,
} from '@app/events';
import { Job } from 'bullmq';
import { Connection, Model } from 'mongoose';
import { ProcessedEvent } from './schemas/processed-event.schema';
import { ProductVariant } from './schemas/product-variant.schema';

const DUPLICATE_KEY = 11000; // Mongo error: trùng khóa unique

/**
 * CONSUMER tồn kho: cộng dồn ProductVariant.availableQty theo delta (bản copy do WMS
 * sync về, match theo sku). KHÔNG đọc wms_db.
 *
 * Idempotency: job retry tới 5 lần nên $inc KHÔNG tự an toàn (retry sau khi đã ghi =
 * cộng kép). Ta ghi jobId vào sổ processed_events TRONG CÙNG transaction với $inc →
 * lần retry sẽ vướng khóa unique và bị bỏ qua. Cần MongoDB replica set (dự án đã yêu cầu).
 */
@Processor(QUEUES.STOCK)
export class StockConsumer extends WorkerHost {
  private readonly logger = new Logger(StockConsumer.name);

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariant>,
    @InjectModel(ProcessedEvent.name)
    private readonly processedModel: Model<ProcessedEvent>,
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
        await this.applyDeltaOnce(job, sku, delta);
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên stock-queue: ${job.name}`);
    }
  }

  /** Áp delta đúng MỘT lần cho mọi variant cùng sku (idempotent theo jobId). */
  private async applyDeltaOnce(
    job: Job,
    sku: string,
    delta: number,
  ): Promise<void> {
    const jobId = String(job.id);
    const session = await this.conn.startSession();
    try {
      await session.withTransaction(async () => {
        // Ghi dấu jobId trước — nếu đã xử lý, unique index ném 11000 → bỏ qua.
        await this.processedModel.create([{ jobId, eventName: job.name }], {
          session,
        });
        await this.variantModel.updateMany(
          { sku },
          { $inc: { availableQty: delta } },
          { session },
        );
      });
      this.logger.log(`availableQty[${sku}] += ${delta} (job ${jobId})`);
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === DUPLICATE_KEY) {
        this.logger.warn(
          `Job ${jobId} đã xử lý trước đó → bỏ qua (idempotent).`,
        );
        return;
      }
      throw err; // lỗi khác → để BullMQ retry
    } finally {
      await session.endSession();
    }
  }
}
