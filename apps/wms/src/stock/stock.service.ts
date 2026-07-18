import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  EVENTS,
  QUEUES,
  type StockChangedPayload,
  type StockLowPayload,
} from '@app/events';
import { AppException } from '@app/common';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { StockRepository } from './stock.repository';
import type { CreateWarehouseItemData } from './stock.repository';
import type { WarehouseItemDocument } from './schemas/warehouse-item.schema';
import type { QueryWarehouseItemDto } from './dto/query-warehouse-item.dto';
import type { UpdateWarehouseItemDto } from './dto/create-warehouse-item.dto';

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
    @InjectQueue(QUEUES.NOTIFICATION)
    private readonly notificationQueue: Queue,
  ) {}

  /** Phát event báo Ecommerce cộng/trừ availableQty theo delta (đã gộp mọi kho).
   * jobId = refType:refId:sku — deterministic theo đúng chứng từ nguồn (khớp
   * StockMovement.refType/refId), để BullMQ tự chặn tạo job trùng nếu bị gọi
   * lặp cho cùng 1 biến động thật (vd retry ở tầng trên) — tránh Ecom cộng
   * dồn availableQty 2 lần cho cùng 1 sự kiện. */
  async emitStockChanged(
    sku: string,
    delta: number,
    refType: string,
    refId: Types.ObjectId | string,
  ): Promise<void> {
    const payload: StockChangedPayload = { sku, delta };
    const jobId = `${refType}:${refId.toString()}:${sku}`;
    await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload, { jobId });
    this.logger.log(`stock.changed → sku=${sku} delta=${delta} jobId=${jobId}`);
  }

  /**
   * Tính lại available tổng (mọi kho) của 1 item rồi báo Ecommerce.
   * Dùng sau khi ghi stock_balances trong các nghiệp vụ WMS.
   */
  async publishAvailableForItem(
    itemId: string,
    delta: number,
    refType: string,
    refId: Types.ObjectId | string,
  ): Promise<void> {
    const item = await this.stockRepo.findSkuById(itemId);
    if (!item) return;
    await this.emitStockChanged(item.sku, delta, refType, refId);
  }

  /**
   * Kiểm tra available HIỆN TẠI (đọc lại DB, KHÔNG nhận balance qua tham số) sau
   * biến động, phát stock.low nếu dưới ngưỡng minQuantity. PHẢI gọi SAU KHI
   * transaction Mongo đã commit — BullMQ không tham gia transaction. Đọc lại (thay
   * vì dùng giá trị upsertBalance trả về ngay trong transaction) để luôn đúng với
   * trạng thái CUỐI CÙNG khi 1 (item,warehouse) bị chạm nhiều lần trong cùng
   * transaction (vd GoodsReturn dòng DAMAGED: RETURN_IN rồi SCRAP bù ngay sau).
   * KHÔNG dùng jobId khi add job — mỗi lần gọi đều phải tạo job mới (quyết định:
   * không dedup, chấp nhận báo lại nếu tồn thấp kéo dài qua nhiều biến động).
   */
  async checkAndEmitStockLow(
    itemId: Types.ObjectId,
    warehouseId: Types.ObjectId,
  ): Promise<void> {
    const item = await this.stockRepo.findSkuAndMinQuantityById(itemId);
    if (!item || item.minQuantity == null) return;

    const balance = await this.stockRepo.findBalanceByItemAndWarehouse(
      itemId,
      warehouseId,
    );
    if (!balance) return;

    const available = balance.onHand - balance.reserved - balance.expired;
    if (available >= item.minQuantity) return;

    const payload: StockLowPayload = {
      sku: item.sku,
      warehouseId: warehouseId.toString(),
      available,
      minQuantity: item.minQuantity,
    };
    await this.notificationQueue.add(EVENTS.STOCK_LOW, payload);
    this.logger.log(
      `stock.low → sku=${item.sku} warehouseId=${warehouseId.toString()} available=${available} minQuantity=${item.minQuantity}`,
    );
  }

  /** Tạo WarehouseItem mới. Chặn trùng sku kể cả với bản ghi đã soft-delete. */
  async createWarehouseItem(
    data: CreateWarehouseItemData,
    actorId: string,
  ): Promise<WarehouseItemDocument> {
    const existing = await this.stockRepo.findItemBySku(data.sku);
    if (existing) {
      throw new AppException('STOCK_ITEM_SKU_CONFLICT');
    }
    return this.stockRepo.createItem(data, new Types.ObjectId(actorId));
  }

  async listWarehouseItems(
    query: QueryWarehouseItemDto,
  ): Promise<{ data: WarehouseItemDocument[]; total: number }> {
    return this.stockRepo.findItems(query);
  }

  async getWarehouseItem(id: string): Promise<WarehouseItemDocument> {
    const doc = await this.stockRepo.findItemByIdDocument(id);
    if (!doc) throw new AppException('STOCK_ITEM_NOT_FOUND');
    return doc;
  }

  async updateWarehouseItem(
    id: string,
    dto: UpdateWarehouseItemDto,
    actorId: string,
  ): Promise<WarehouseItemDocument> {
    const doc = await this.stockRepo.updateItem(id, dto, actorId);
    if (!doc) throw new AppException('STOCK_ITEM_NOT_FOUND');
    return doc;
  }

  async deleteWarehouseItem(id: string, actorId: string): Promise<void> {
    const deleted = await this.stockRepo.softDeleteItem(id, actorId);
    if (!deleted) throw new AppException('STOCK_ITEM_NOT_FOUND');
  }
}
