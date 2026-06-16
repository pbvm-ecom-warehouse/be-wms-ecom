import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EVENTS, QUEUES, type StockChangedPayload } from '@app/events';
import { Queue } from 'bullmq';
import { StockRepository } from './stock.repository';

/**
 * Ví dụ PRODUCER: khi `available` (= onHand - reserved - expired) của 1 SKU đổi
 * do biến động phía WMS, bắn event stock.changed sang Ecommerce (Σ mọi kho).
 * Đây là mẫu để các nghiệp vụ thật (GRN, kiểm kho, chuyển kho, in ly...) tái dùng.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly stockRepo: StockRepository,
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
  ) {}

  /** Phát event báo Ecommerce cộng/trừ availableQty theo delta (đã gộp mọi kho). */
  async emitStockChanged(sku: string, delta: number): Promise<void> {
    const payload: StockChangedPayload = { sku, delta };
    await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload);
    this.logger.log(`stock.changed → sku=${sku} delta=${delta}`);
  }

  /**
   * Tính lại available tổng (mọi kho) của 1 item rồi báo Ecommerce.
   * Dùng sau khi ghi stock_balances trong các nghiệp vụ WMS.
   */
  async publishAvailableForItem(itemId: string, delta: number): Promise<void> {
    const item = await this.stockRepo.findSkuById(itemId);
    if (!item) return;
    await this.emitStockChanged(item.sku, delta);
  }
}
