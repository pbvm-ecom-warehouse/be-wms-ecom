import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  EVENTS,
  QUEUES,
  type StockReservedPayload,
  type StockReserveFailedPayload,
} from '@app/events';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { StockRepository } from '../stock/stock.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { LocationRepository } from '../location/location.repository';
import { GoodsIssueRepository } from '../goods-issue/goods-issue.repository';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import { SYSTEM_ACTOR_ID } from './reservation.constants';

interface ReserveItem {
  sku: string;
  quantity: number;
}

const REF_TYPE_RESERVE = 'reservation';
const REF_TYPE_RELEASE = 'reservation_release';

@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name);

  constructor(
    private readonly stockRepo: StockRepository,
    private readonly stockTransactionHelper: StockTransactionHelper,
    private readonly locationRepo: LocationRepository,
    private readonly goodsIssueRepo: GoodsIssueRepository,
    @InjectQueue(QUEUES.ORDER_REPLY) private readonly orderReplyQueue: Queue,
  ) {}

  /**
   * Xử lý STOCK_RESERVE_REQUESTED. Idempotent theo orderId (kiểm tra đã có
   * movement 'reservation' chưa). App = 1 kho duy nhất nên reserve trực tiếp
   * trên pool tồn kho chung, atomic theo từng sku trong 1 transaction — nếu
   * 1 sku không đủ, transaction abort và toàn bộ reserve tạm thời tự rollback.
   */
  async reserveForOrder(orderId: string, items: ReserveItem[]): Promise<void> {
    const alreadyReserved = await this.stockRepo.hasMovementForRef(
      REF_TYPE_RESERVE,
      new Types.ObjectId(orderId),
    );
    if (alreadyReserved) {
      this.logger.warn(
        `Đơn ${orderId} đã được reserve trước đó → bỏ qua (idempotent).`,
      );
      return;
    }

    const resolvedItems: {
      itemId: Types.ObjectId;
      sku: string;
      quantity: number;
    }[] = [];
    const missingSkus: string[] = [];
    for (const item of items) {
      const warehouseItem = await this.stockRepo.findItemBySku(item.sku);
      if (!warehouseItem) {
        missingSkus.push(item.sku);
        continue;
      }
      resolvedItems.push({
        itemId: warehouseItem._id,
        sku: item.sku,
        quantity: item.quantity,
      });
    }

    if (missingSkus.length > 0) {
      await this.emitReserveFailed(
        orderId,
        `Sku không tồn tại: ${missingSkus.join(', ')}`,
        missingSkus,
      );
      return;
    }

    const stagingShelf = await this.locationRepo.findStagingShelf();
    if (!stagingShelf) {
      await this.emitReserveFailed(
        orderId,
        'Hệ thống chưa cấu hình vị trí nhận hàng (staging)',
        resolvedItems.map((i) => i.sku),
      );
      return;
    }

    const reserved = await this.tryReserveAll(
      orderId,
      resolvedItems,
      stagingShelf._id,
    );
    if (reserved) {
      await this.emitReserved(orderId);
      return;
    }

    await this.emitReserveFailed(
      orderId,
      'Không đủ tồn cho toàn bộ đơn hàng',
      resolvedItems.map((i) => i.sku),
    );
  }

  private async tryReserveAll(
    orderId: string,
    items: { itemId: Types.ObjectId; sku: string; quantity: number }[],
    stagingShelfId: Types.ObjectId,
  ): Promise<boolean> {
    let allReserved = true;
    try {
      await this.stockTransactionHelper.withStockTransaction(
        async (session) => {
          for (const item of items) {
            const ok = await this.stockRepo.reserveIfAvailable(
              item.itemId,
              item.quantity,
              session,
            );
            if (!ok) {
              allReserved = false;
              throw new Error('INSUFFICIENT_STOCK'); // abort transaction, rollback mọi $inc trước đó
            }
            await this.stockRepo.insertMovement(
              {
                itemId: item.itemId,
                shelfId: stagingShelfId,
                lotId: null,
                type: MovementType.RESERVE,
                quantity: item.quantity,
                refType: REF_TYPE_RESERVE,
                refId: new Types.ObjectId(orderId),
                createdBy: SYSTEM_ACTOR_ID,
              },
              session,
            );
          }
        },
      );
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_STOCK') {
        return false;
      }
      throw err;
    }
    return allReserved;
  }

  private async emitReserved(orderId: string): Promise<void> {
    const payload: StockReservedPayload = { orderId };
    await this.orderReplyQueue.add(EVENTS.STOCK_RESERVED, payload, {
      jobId: `reservation:${orderId}`,
    });
    this.logger.log(`stock.reserved → orderId=${orderId}`);
  }

  private async emitReserveFailed(
    orderId: string,
    reason: string,
    failedSkus: string[],
  ): Promise<void> {
    const payload: StockReserveFailedPayload = { orderId, reason, failedSkus };
    await this.orderReplyQueue.add(EVENTS.STOCK_RESERVE_FAILED, payload, {
      jobId: `reservation-failed:${orderId}`,
    });
    this.logger.warn(
      `stock.reserve_failed → orderId=${orderId} reason=${reason}`,
    );
  }

  /**
   * Xử lý ORDER_CANCELLED — giải phóng reserved đã giữ lúc checkout.
   * Idempotent: bỏ qua nếu chưa từng reserve, hoặc đã release trước đó.
   * Bỏ qua (log warning) nếu GoodsIssue đã tồn tại cho đơn — không tự động
   * hủy GoodsIssue (ngoài phạm vi).
   */
  async releaseForOrder(orderId: string): Promise<void> {
    const orderObjectId = new Types.ObjectId(orderId);

    const alreadyReleased = await this.stockRepo.hasMovementForRef(
      REF_TYPE_RELEASE,
      orderObjectId,
    );
    if (alreadyReleased) {
      this.logger.warn(
        `Đơn ${orderId} đã được release trước đó → bỏ qua (idempotent).`,
      );
      return;
    }

    const reserveMovements = await this.stockRepo.findMovementsByRef(
      REF_TYPE_RESERVE,
      orderObjectId,
    );
    if (reserveMovements.length === 0) {
      this.logger.warn(
        `Đơn ${orderId} chưa từng được reserve → không có gì để release.`,
      );
      return;
    }

    const existingGoodsIssue = await this.goodsIssueRepo.findByOrderId(orderId);
    if (existingGoodsIssue) {
      this.logger.warn(
        `Đơn ${orderId} đã có GoodsIssue (${existingGoodsIssue._id.toString()}) → không tự động release, cần xử lý thủ công.`,
      );
      return;
    }

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      for (const movement of reserveMovements) {
        await this.stockRepo.upsertBalance(
          movement.itemId,
          0,
          -movement.quantity,
          0,
          session,
        );
        await this.stockRepo.insertMovement(
          {
            itemId: movement.itemId,
            shelfId: movement.shelfId,
            lotId: null,
            type: MovementType.RELEASE,
            quantity: -movement.quantity,
            refType: REF_TYPE_RELEASE,
            refId: orderObjectId,
            createdBy: SYSTEM_ACTOR_ID,
          },
          session,
        );
      }
    });

    this.logger.log(
      `stock.release → orderId=${orderId} (${reserveMovements.length} dòng)`,
    );
  }
}
