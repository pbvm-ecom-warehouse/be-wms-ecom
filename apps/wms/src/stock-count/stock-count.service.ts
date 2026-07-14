import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { EVENTS, QUEUES, type StockChangedPayload } from '@app/events';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import {
  StockCountRepository,
  QueryStockCountInput,
} from './stock-count.repository';
import type {
  ApproveStockCountDto,
  CountStockCountItemDto,
  CreateStockCountDto,
} from './dto/stock-count.dto';
import {
  StockCountStatus,
  type StockCountDocument,
} from './schemas/stock-count.schema';
import { StockRepository } from '../stock/stock.repository';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';

@Injectable()
export class StockCountService {
  constructor(
    private readonly repo: StockCountRepository,
    private readonly stockRepo: StockRepository,
    private readonly warehouseRepo: WarehouseRepository,
    private readonly stockTransactionHelper: StockTransactionHelper,
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
  ) {}

  /**
   * MANAGER tạo phiếu kiểm kho — auto-generate dòng từ InventoryStock hiện có
   * trong phạm vi (toàn kho nếu không truyền zoneId). Không cho tạo phiếu
   * rỗng vì không có gì để đếm.
   */
  async createStockCount(
    dto: CreateStockCountDto,
    actorId: string,
  ): Promise<StockCountDocument> {
    const warehouseId = new Types.ObjectId(dto.warehouseId);
    const warehouse = await this.warehouseRepo.findWarehouseById(
      dto.warehouseId,
    );
    if (!warehouse) throw new AppException('WAREHOUSE_NOT_FOUND');

    let zoneId: Types.ObjectId | null = null;
    let shelfIds: Types.ObjectId[] | undefined;
    if (dto.zoneId) {
      const zone = await this.warehouseRepo.findZoneById(dto.zoneId);
      if (!zone || zone.warehouseId.toString() !== dto.warehouseId) {
        throw new AppException('ZONE_NOT_FOUND');
      }
      zoneId = new Types.ObjectId(dto.zoneId);
      shelfIds = await this.warehouseRepo.findShelfIdsByZone(dto.zoneId);
    }

    const inventory = await this.stockRepo.findInventoryByScope(
      warehouseId,
      shelfIds,
    );
    if (inventory.length === 0) {
      throw new AppException('STOCK_COUNT_EMPTY_SCOPE');
    }

    const lines = await Promise.all(
      inventory.map(async (inv) => {
        const item = await this.stockRepo.findSkuById(inv.itemId.toString());
        return {
          itemId: inv.itemId,
          sku: item?.sku ?? '',
          shelfId: inv.shelfId,
          lotId: inv.lotId,
          systemQty: inv.quantity,
        };
      }),
    );

    return this.repo.createStockCount(
      warehouseId,
      zoneId,
      dto.note,
      new Types.ObjectId(actorId),
      lines,
    );
  }

  /**
   * COUNTER nhập số đếm thực cho 1 dòng (item+shelf+lot). Không đổi tồn thật
   * ngay — chỉ ghi nhận actualQty/delta trên chính StockCount, chờ MANAGER
   * approve mới áp dụng ADJUST.
   */
  async countItem(
    id: string,
    itemId: string,
    dto: CountStockCountItemDto,
    actorId: string,
  ): Promise<StockCountDocument> {
    const stockCount = await this.repo.findById(id);
    if (!stockCount) throw new AppException('STOCK_COUNT_NOT_FOUND');
    if (stockCount.status === StockCountStatus.APPROVED) {
      throw new AppException('STOCK_COUNT_ALREADY_APPROVED');
    }

    const itemObjId = new Types.ObjectId(itemId);
    const shelfObjId = new Types.ObjectId(dto.shelfId);
    const lotObjId = dto.lotId ? new Types.ObjectId(dto.lotId) : null;

    const line = stockCount.items.find(
      (i) =>
        i.itemId.toString() === itemId &&
        i.shelfId.toString() === dto.shelfId &&
        (i.lotId?.toString() ?? null) === (dto.lotId ?? null),
    );
    if (!line) throw new AppException('STOCK_COUNT_ITEM_MISMATCH');

    if (stockCount.status === StockCountStatus.DRAFT) {
      await this.repo.setCountedByIfDraft(id, new Types.ObjectId(actorId));
    }

    await this.repo.countItem(
      id,
      itemObjId,
      shelfObjId,
      lotObjId,
      dto.actualQty,
      dto.reason ?? null,
    );
    await this.repo.markCompletedIfAllCounted(id);

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('STOCK_COUNT_NOT_FOUND');
    return updated;
  }

  /**
   * MANAGER duyệt cả phiếu — áp ADJUST cho mọi dòng có delta !== 0 trong 1
   * transaction, rồi bắn stock.changed cho mỗi dòng lệch (available đổi
   * trực tiếp qua onHand, không qua reserved, nên luôn cần sync Ecom).
   */
  async approveStockCount(
    id: string,
    dto: ApproveStockCountDto,
    actorId: string,
  ): Promise<StockCountDocument> {
    const stockCount = await this.repo.findById(id);
    if (!stockCount) throw new AppException('STOCK_COUNT_NOT_FOUND');
    if (stockCount.status !== StockCountStatus.COMPLETED) {
      throw new AppException('STOCK_COUNT_NOT_COMPLETED');
    }

    const changedLines = stockCount.items.filter(
      (i) => i.delta !== null && i.delta !== 0,
    );

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      for (const line of changedLines) {
        const delta = line.delta!;
        await this.stockRepo.upsertInventory(
          line.itemId,
          stockCount.warehouseId,
          line.shelfId,
          line.lotId,
          delta,
          session,
        );
        await this.stockRepo.upsertBalance(
          line.itemId,
          stockCount.warehouseId,
          delta,
          0,
          0,
          session,
        );
        await this.stockRepo.insertMovement(
          {
            itemId: line.itemId,
            warehouseId: stockCount.warehouseId,
            shelfId: line.shelfId,
            lotId: line.lotId,
            type: MovementType.ADJUST,
            quantity: delta,
            refType: 'stock_count',
            refId: stockCount._id,
            createdBy: new Types.ObjectId(actorId),
          },
          session,
        );
      }
      await this.repo.setApproved(
        id,
        new Types.ObjectId(actorId),
        dto.reason,
        session,
      );
    });

    for (const line of changedLines) {
      const payload: StockChangedPayload = {
        sku: line.sku,
        delta: line.delta!,
      };
      const jobId = `stock_count:${id}:${line.sku}`;
      await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload, { jobId });
    }

    const updated = await this.repo.findById(id);
    if (!updated) throw new AppException('STOCK_COUNT_NOT_FOUND');
    return updated;
  }

  async listStockCounts(
    query: QueryStockCountInput,
  ): Promise<{ data: StockCountDocument[]; total: number }> {
    return this.repo.findAll(query);
  }

  async getStockCount(id: string): Promise<StockCountDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('STOCK_COUNT_NOT_FOUND');
    return doc;
  }
}
