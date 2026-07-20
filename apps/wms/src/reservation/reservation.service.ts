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
import { WarehouseRepository } from '../warehouse/warehouse.repository';
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
    private readonly warehouseRepo: WarehouseRepository,
    private readonly goodsIssueRepo: GoodsIssueRepository,
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
  ) {}

  /**
   * Xử lý STOCK_RESERVE_REQUESTED. Idempotent theo orderId (kiểm tra đã có
   * movement 'reservation' chưa). Chọn 1 kho duy nhất đủ tồn cho TOÀN BỘ sku
   * trong đơn (ưu tiên preferWarehouse), atomic theo từng sku trong 1
   * transaction — nếu 1 sku không đủ ở kho đang thử, transaction abort và
   * toàn bộ reserve tạm thời trong kho đó tự rollback, chuyển sang kho khác.
   */
  async reserveForOrder(
    orderId: string,
    items: ReserveItem[],
    preferWarehouse?: string,
  ): Promise<void> {
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

    // preferWarehouse không dùng để chọn kho: payload hiện gửi chuỗi tượng
    // trưng (vd 'CENTRAL') nhưng Warehouse schema không có code/slug nào để
    // đối chiếu — tham số vẫn được nhận để khớp StockReserveRequestedPayload,
    // nhưng bị bỏ qua. Thử lần lượt mọi kho active theo thứ tự createdAt asc.
    void preferWarehouse;

    // Có sku không tồn tại trong WarehouseItem → đơn không thể reserve đủ dù
    // kho nào đi nữa. Bỏ qua vòng thử kho (tránh mở transaction vô ích) —
    // đồng thời tránh bug "mảng resolvedItems rỗng" khiến tryReserveAllAtWarehouse
    // coi vòng lặp for rỗng là "đã reserve hết" (allReserved mặc định true).
    const candidateIds =
      missingSkus.length > 0
        ? []
        : await this.warehouseRepo.findAllActiveWarehouseIds();

    for (const warehouseId of candidateIds) {
      const stagingShelf = await this.warehouseRepo.findStagingShelfByWarehouse(
        warehouseId.toString(),
      );
      if (!stagingShelf) continue; // kho không có staging shelf → bỏ qua ứng viên này

      const reservedHere = await this.tryReserveAllAtWarehouse(
        orderId,
        resolvedItems,
        warehouseId,
        stagingShelf._id,
      );
      if (reservedHere) {
        await this.emitReserved(orderId, warehouseId);
        return;
      }
    }

    await this.emitReserveFailed(
      orderId,
      missingSkus.length > 0
        ? `Sku không tồn tại: ${missingSkus.join(', ')}`
        : 'Không kho nào đủ tồn cho toàn bộ đơn hàng',
      missingSkus.length > 0 ? missingSkus : resolvedItems.map((i) => i.sku),
    );
  }

  private async tryReserveAllAtWarehouse(
    orderId: string,
    items: { itemId: Types.ObjectId; sku: string; quantity: number }[],
    warehouseId: Types.ObjectId,
    stagingShelfId: Types.ObjectId,
  ): Promise<boolean> {
    let allReserved = true;
    try {
      await this.stockTransactionHelper.withStockTransaction(
        async (session) => {
          for (const item of items) {
            const ok = await this.stockRepo.reserveIfAvailable(
              item.itemId,
              warehouseId,
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
                warehouseId,
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

  private async emitReserved(
    orderId: string,
    warehouseId: Types.ObjectId,
  ): Promise<void> {
    const payload: StockReservedPayload = {
      orderId,
      fulfillWarehouseId: warehouseId.toString(),
    };
    await this.orderQueue.add(EVENTS.STOCK_RESERVED, payload, {
      jobId: `reservation:${orderId}`,
    });
    this.logger.log(
      `stock.reserved → orderId=${orderId} warehouseId=${warehouseId.toString()}`,
    );
  }

  private async emitReserveFailed(
    orderId: string,
    reason: string,
    failedSkus: string[],
  ): Promise<void> {
    const payload: StockReserveFailedPayload = { orderId, reason, failedSkus };
    await this.orderQueue.add(EVENTS.STOCK_RESERVE_FAILED, payload, {
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
          movement.warehouseId,
          0,
          -movement.quantity,
          0,
          session,
        );
        await this.stockRepo.insertMovement(
          {
            itemId: movement.itemId,
            warehouseId: movement.warehouseId,
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
