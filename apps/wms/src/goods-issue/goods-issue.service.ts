import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import { EVENTS, QUEUES, type GoodsIssuedPayload } from '@app/events';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import {
  GoodsIssueRepository,
  QueryGoodsIssueInput,
} from './goods-issue.repository';
import type { ConfirmGoodsIssueLineDto } from './dto/goods-issue.dto';
import type { GoodsIssueDocument } from './schemas/goods-issue.schema';
import {
  StockRepository,
  type PickSuggestion,
} from '../stock/stock.repository';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';

interface OrderReadyItem {
  sku: string;
  quantity: number;
}

@Injectable()
export class GoodsIssueService {
  private readonly logger = new Logger(GoodsIssueService.name);

  constructor(
    private readonly repo: GoodsIssueRepository,
    private readonly stockRepo: StockRepository,
    private readonly warehouseRepo: WarehouseRepository,
    private readonly stockTransactionHelper: StockTransactionHelper,
    @InjectQueue(QUEUES.SHIPMENT) private readonly shipmentQueue: Queue,
  ) {}

  /**
   * Gọi từ OrderReadyConsumer khi nhận order.ready_to_fulfill. Idempotent theo
   * orderId (unique index) — event redeliver không tạo phiếu trùng. Sku không
   * khớp WarehouseItem bị bỏ qua (log warning) thay vì chặn cả phiếu, vì retry
   * BullMQ sẽ lặp lại lỗi y hệt nếu throw ở đây.
   */
  async createFromOrderReady(
    orderId: string,
    warehouseId: string,
    items: OrderReadyItem[],
  ): Promise<void> {
    const existing = await this.repo.findByOrderId(orderId);
    if (existing) {
      this.logger.warn(
        `GoodsIssue đã tồn tại cho orderId=${orderId} → bỏ qua (idempotent).`,
      );
      return;
    }

    const lines: { itemId: Types.ObjectId; sku: string; quantity: number }[] =
      [];
    for (const item of items) {
      const warehouseItem = await this.stockRepo.findItemBySku(item.sku);
      if (!warehouseItem) {
        this.logger.warn(
          `Sku=${item.sku} không khớp WarehouseItem nào → bỏ qua dòng này (orderId=${orderId}).`,
        );
        continue;
      }
      lines.push({
        itemId: warehouseItem._id,
        sku: item.sku,
        quantity: item.quantity,
      });
    }

    if (lines.length === 0) {
      this.logger.warn(
        `Không có dòng nào khớp sku cho orderId=${orderId} → không tạo GoodsIssue.`,
      );
      return;
    }

    await this.repo.createGoodsIssue(
      orderId,
      new Types.ObjectId(warehouseId),
      lines,
    );
  }

  async getPickSuggestions(
    id: string,
    itemId: string,
  ): Promise<PickSuggestion[]> {
    const gi = await this.repo.findById(id);
    if (!gi) throw new AppException('GOODS_ISSUE_NOT_FOUND');
    const line = gi.items.find((i) => i.itemId.toString() === itemId);
    if (!line) throw new AppException('GOODS_ISSUE_ITEM_MISMATCH');

    const warehouseItem = await this.stockRepo.findItemById(itemId);
    const isPerishable = warehouseItem?.isPerishable ?? false;

    return this.stockRepo.findAvailableStockForPick(
      new Types.ObjectId(itemId),
      gi.warehouseId,
      isPerishable,
    );
  }

  /**
   * PICKER quét itemBarcode + shelfCode để xác nhận xuất 1 dòng.
   * Đối xứng với PutAwayService.confirmLine, nhưng trừ onHand+reserved
   * (available không đổi — đã trừ lúc reserve ở checkout) thay vì chỉ dịch
   * chuyển vị trí, và KHÔNG bắn stock.changed.
   */
  async confirmLine(
    id: string,
    dto: ConfirmGoodsIssueLineDto,
    actorId: string,
  ): Promise<GoodsIssueDocument> {
    const gi = await this.repo.findById(id);
    if (!gi) throw new AppException('GOODS_ISSUE_NOT_FOUND');

    const item = await this.stockRepo.findItemByBarcode(dto.itemBarcode);
    if (!item) throw new AppException('GOODS_ISSUE_ITEM_NOT_FOUND');

    const shelf = await this.warehouseRepo.findShelfByCode(dto.shelfCode);
    if (!shelf) throw new AppException('GOODS_ISSUE_SHELF_NOT_FOUND');
    if (shelf.warehouseId.toString() !== gi.warehouseId.toString()) {
      throw new AppException('GOODS_ISSUE_SHELF_NOT_FOUND');
    }

    const line = gi.items.find(
      (i) => i.itemId.toString() === item._id.toString(),
    );
    if (!line) throw new AppException('GOODS_ISSUE_ITEM_MISMATCH');
    if (dto.quantity > line.remainingQty) {
      throw new AppException('GOODS_ISSUE_QTY_EXCEEDS');
    }

    const lotId = dto.lotId ? new Types.ObjectId(dto.lotId) : null;
    const inventory = await this.stockRepo.findInventory(
      item._id,
      gi.warehouseId,
      shelf._id,
      lotId,
    );
    if (!inventory || inventory.quantity < dto.quantity) {
      throw new AppException('STOCK_INSUFFICIENT');
    }

    let justConfirmed = false;
    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      await this.stockRepo.upsertInventory(
        item._id,
        gi.warehouseId,
        shelf._id,
        lotId,
        -dto.quantity,
        session,
      );
      await this.stockRepo.upsertBalance(
        item._id,
        gi.warehouseId,
        -dto.quantity,
        -dto.quantity,
        0,
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: item._id,
          warehouseId: gi.warehouseId,
          shelfId: shelf._id,
          lotId,
          type: MovementType.ISSUE,
          quantity: -dto.quantity,
          refType: 'goods_issue',
          refId: gi._id,
          createdBy: new Types.ObjectId(actorId),
        },
        session,
      );
      await this.repo.decrementRemainingQty(
        id,
        item._id,
        dto.quantity,
        session,
      );
      justConfirmed = await this.repo.markConfirmedIfAllDone(id, session);
    });

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('GOODS_ISSUE_NOT_FOUND');

    if (justConfirmed) {
      await this.emitGoodsIssued(gi.orderId, id);
    }

    return updated;
  }

  private async emitGoodsIssued(
    orderId: string,
    goodsIssueId: string,
  ): Promise<void> {
    const payload: GoodsIssuedPayload = { orderId, goodsIssueId };
    const jobId = `goods_issue:${goodsIssueId}`;
    await this.shipmentQueue.add(EVENTS.GOODS_ISSUED, payload, { jobId });
    this.logger.log(
      `goods.issued → orderId=${orderId} goodsIssueId=${goodsIssueId}`,
    );
  }

  async listGoodsIssues(
    query: QueryGoodsIssueInput,
  ): Promise<{ data: GoodsIssueDocument[]; total: number }> {
    return this.repo.findAll(query);
  }

  async getGoodsIssue(id: string): Promise<GoodsIssueDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('GOODS_ISSUE_NOT_FOUND');
    return doc;
  }
}
