import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { ProcessedEvent } from './schemas/processed-event.schema';
import { ProductVariant } from './schemas/product-variant.schema';

const DUPLICATE_KEY = 11000;

@Injectable()
export class CatalogRepository {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariant>,
    @InjectModel(ProcessedEvent.name)
    private readonly processedModel: Model<ProcessedEvent>,
  ) {}

  /**
   * Cộng dồn availableQty theo delta, đảm bảo idempotency bằng transaction +
   * unique index trên jobId. Trả về false nếu job đã được xử lý trước đó.
   * Cần MongoDB replica set (Atlas mặc định có, local: rs.initiate()).
   */
  async applyStockDeltaOnce(
    jobId: string,
    eventName: string,
    sku: string,
    delta: number,
  ): Promise<boolean> {
    const session = await this.conn.startSession();
    try {
      await session.withTransaction(async () => {
        // Ghi dấu jobId trước — nếu đã xử lý, unique index ném 11000 → rollback.
        await this.processedModel.create([{ jobId, eventName }], { session });
        await this.variantModel.updateMany(
          { sku },
          { $inc: { availableQty: delta } },
          { session },
        );
      });
      return true;
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === DUPLICATE_KEY) return false;
      throw err;
    } finally {
      await session.endSession();
    }
  }
}
