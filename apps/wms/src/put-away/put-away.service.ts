// apps/wms/src/put-away/put-away.service.ts
import { Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { AppException } from '@app/common';
import {
  PutAwayRepository,
  QueryPutAwayTaskInput,
} from './put-away.repository';
import { StockRepository } from '../stock/stock.repository';
import { LocationRepository } from '../location/location.repository';
import { LocationService } from '../location/location.service';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import { BarcodeService } from '../stock/barcode/barcode.service';
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
    private readonly locationRepo: LocationRepository,
    private readonly locationService: LocationService,
    private readonly stockTransactionHelper: StockTransactionHelper,
    private readonly barcodeSvc: BarcodeService,
  ) {}

  /** Gọi từ GoodsReceiptNoteService.confirmGoodsReceiptNote, cùng transaction cộng tồn 2 lớp. */
  async createTaskFromGrn(
    grnId: Types.ObjectId,
    lines: CreatePutAwayLineFromGrnInput[],
    actorId: string,
    session: ClientSession,
  ): Promise<PutAwayTaskDocument> {
    return this.repo.createTask(
      grnId,
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

    const itemId = await this.barcodeSvc.findItemIdByCode(dto.itemBarcode);
    if (!itemId) throw new AppException('PUTAWAY_ITEM_NOT_FOUND');
    const item = await this.stockRepo.findItemByIdDocument(itemId.toString());
    if (!item) throw new AppException('PUTAWAY_ITEM_NOT_FOUND');

    // Gọi thẳng LocationRepository (không qua LocationService.findShelfByCode) vì
    // shelf-not-found ở luồng put-away phải throw code domain riêng PUTAWAY_SHELF_NOT_FOUND,
    // không phải SHELF_NOT_FOUND cross-cutting của module location (xem spec S2-04 dòng 77).
    const shelf = await this.locationRepo.findShelfByCode(dto.shelfCode);
    if (!shelf) throw new AppException('PUTAWAY_SHELF_NOT_FOUND');
    if (shelf.isStaging) throw new AppException('PUTAWAY_SHELF_IS_STAGING');

    // Validate tường minh: item isPerishable bắt buộc phải quét kèm lotId.
    // Không có check này, thiếu lotId thường VẪN bị chặn gián tiếp (vì lotId thật
    // của dòng task khác null nên không match ở bước tìm `line` bên dưới) — nhưng
    // đó là hệ quả tình cờ của dữ liệu, không phải validate rõ ràng. Chặn sớm ở
    // đây để không phụ thuộc vào việc task.items có tồn tại dòng lotId=null trùng
    // khớp hay không (dùng chung code lỗi PUTAWAY_ITEM_MISMATCH, không cần code mới).
    if (item.isPerishable && !dto.lotId) {
      throw new AppException('PUTAWAY_ITEM_MISMATCH');
    }

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

    const stagingShelf = await this.locationService.findStagingShelf();

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      // Trừ ở staging, cộng ở shelf thật — tổng InventoryStock của item không đổi,
      // chỉ đổi phân bổ theo shelf. StockBalance.onHand không bị đụng tới.
      await this.stockRepo.upsertInventory(
        item._id,
        stagingShelf._id,
        lotId,
        -dto.quantity,
        session,
      );
      await this.stockRepo.upsertInventory(
        item._id,
        shelf._id,
        lotId,
        dto.quantity,
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: item._id,
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
