// apps/wms/src/put-away/put-away.service.ts
import { Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { AppException } from '@app/common';
import {
  PutAwayRepository,
  QueryPutAwayTaskInput,
} from './put-away.repository';
import { StockRepository } from '../stock/stock.repository';
import { WarehouseService } from '../warehouse/warehouse.service';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import type { PutAwayTaskDocument } from './schemas/put-away-task.schema';

export interface CreatePutAwayLineFromGrnInput {
  itemId: string;
  lotId: Types.ObjectId | null;
  quantity: number;
}

export interface ConfirmPutAwayLineInput {
  itemBarcode: string;
  shelfCode: string;
  quantity: number;
  lotId?: string;
}

@Injectable()
export class PutAwayService {
  constructor(
    private readonly repo: PutAwayRepository,
    private readonly stockRepo: StockRepository,
    private readonly warehouseService: WarehouseService,
    private readonly stockTransactionHelper: StockTransactionHelper,
  ) {}

  /** Gọi từ GoodsReceiptNoteService.confirmGoodsReceiptNote, cùng transaction cộng tồn 2 lớp. */
  async createTaskFromGrn(
    grnId: Types.ObjectId,
    warehouseId: Types.ObjectId,
    lines: CreatePutAwayLineFromGrnInput[],
    actorId: string,
    session: ClientSession,
  ): Promise<PutAwayTaskDocument> {
    return this.repo.createTask(
      grnId,
      warehouseId,
      lines.map((l) => ({
        itemId: new Types.ObjectId(l.itemId),
        lotId: l.lotId,
        quantity: l.quantity,
      })),
      actorId,
      session,
    );
  }

  /**
   * RECEIVER quét itemBarcode + shelfCode thật để xác nhận đã xếp hàng.
   * Bất biến UC-03: đây KHÔNG phải nhập kho — chỉ chuyển vị trí trong cùng
   * kho (staging → shelf thật), nên onHand của StockBalance KHÔNG đổi và
   * KHÔNG publish stock.changed. Chỉ InventoryStock (theo shelf) dịch chuyển.
   */
  async confirmLine(
    taskId: string,
    dto: ConfirmPutAwayLineInput,
    actorId: string,
  ): Promise<PutAwayTaskDocument> {
    const task = await this.repo.findTaskById(taskId);
    if (!task) throw new AppException('PUTAWAY_TASK_NOT_FOUND');

    const item = await this.stockRepo.findItemByBarcode(dto.itemBarcode);
    if (!item) throw new AppException('PUTAWAY_ITEM_NOT_FOUND');

    const shelf = await this.warehouseService.findShelfByCode(dto.shelfCode);
    if (shelf.isStaging) throw new AppException('PUTAWAY_SHELF_IS_STAGING');

    const lotId = dto.lotId ? new Types.ObjectId(dto.lotId) : null;
    const line = task.items.find(
      (i) =>
        i.itemId.toString() === item._id.toString() &&
        (i.lotId?.toString() ?? null) === (lotId?.toString() ?? null),
    );
    if (!line) throw new AppException('PUTAWAY_ITEM_MISMATCH');
    if (dto.quantity > line.remainingQty) {
      throw new AppException('PUTAWAY_QTY_EXCEEDS');
    }

    const stagingShelf = await this.warehouseService.findStagingShelf(
      task.warehouseId.toString(),
    );

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      // Trừ ở staging, cộng ở shelf thật — tổng InventoryStock của item không đổi,
      // chỉ đổi phân bổ theo shelf. StockBalance.onHand không bị đụng tới.
      await this.stockRepo.upsertInventory(
        item._id,
        task.warehouseId,
        stagingShelf._id,
        lotId,
        -dto.quantity,
        session,
      );
      await this.stockRepo.upsertInventory(
        item._id,
        task.warehouseId,
        shelf._id,
        lotId,
        dto.quantity,
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: item._id,
          warehouseId: task.warehouseId,
          shelfId: stagingShelf._id,
          lotId,
          type: MovementType.PUTAWAY,
          quantity: -dto.quantity,
          refType: 'put_away_task',
          refId: task._id,
          createdBy: new Types.ObjectId(actorId),
        },
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: item._id,
          warehouseId: task.warehouseId,
          shelfId: shelf._id,
          lotId,
          type: MovementType.PUTAWAY,
          quantity: dto.quantity,
          refType: 'put_away_task',
          refId: task._id,
          createdBy: new Types.ObjectId(actorId),
        },
        session,
      );
      await this.repo.decrementRemainingQty(
        taskId,
        item._id,
        lotId,
        dto.quantity,
        session,
      );
      await this.repo.markCompletedIfAllDone(taskId, session);
    });

    const updated = await this.repo.findTaskById(taskId);
    if (!updated) throw new AppException('PUTAWAY_TASK_NOT_FOUND');
    return updated;
  }

  async getTask(id: string): Promise<PutAwayTaskDocument> {
    const doc = await this.repo.findTaskById(id);
    if (!doc) throw new AppException('PUTAWAY_TASK_NOT_FOUND');
    return doc;
  }

  async listTasks(
    query: QueryPutAwayTaskInput,
  ): Promise<{ data: PutAwayTaskDocument[]; total: number }> {
    return this.repo.findTasks(query);
  }
}
