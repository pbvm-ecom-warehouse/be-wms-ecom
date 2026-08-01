// apps/wms/src/put-away/put-away.service.ts
import { Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { AppException } from '@app/common/errors/app.exception';
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
import {
  PutAwayTaskSourceType,
  type PutAwayTaskDocument,
} from './schemas/put-away-task.schema';
import { ZonePurpose } from '../location/schemas/zone.schema';

export interface CreatePutAwayLineFromGrnInput {
  itemId: string;
  sku?: string;
  lotId: Types.ObjectId | null;
  quantity: number;
  packageSpec?: {
    unit: string;
    factor: number;
    depthCm: number;
    widthCm: number;
    heightCm: number;
    volumeCm3: number;
  };
}

export interface ConfirmPutAwayLineInput {
  itemBarcode: string;
  shelfCode?: string;
  cellBarcode?: string;
  quantity?: number;
  suggestedCellId?: string;
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

  /** Gọi từ GoodsReceiptNoteService.approveGoodsReceiptNote, cùng transaction cộng tồn 2 lớp. */
  async createTaskFromGrn(
    grnId: Types.ObjectId,
    lines: CreatePutAwayLineFromGrnInput[],
    actorId: string,
    session: ClientSession,
    sourceShelfId: Types.ObjectId,
    source: {
      type: PutAwayTaskSourceType;
      number?: string;
    } = { type: PutAwayTaskSourceType.GOODS_RECEIPT },
  ): Promise<PutAwayTaskDocument> {
    return this.repo.createTask(
      grnId,
      lines.map((l) => ({
        itemId: new Types.ObjectId(l.itemId),
        sku: l.sku,
        lotId: l.lotId,
        quantity: l.quantity,
        packageSpec: l.packageSpec,
      })),
      actorId,
      session,
      sourceShelfId,
      source,
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

    const cell = dto.cellBarcode
      ? await this.locationRepo.findCellByCode(dto.cellBarcode)
      : null;
    if (!cell) throw new AppException('PUTAWAY_CELL_NOT_FOUND');
    const shelf = await this.locationRepo.findShelfById(
      cell.shelfId.toString(),
    );
    if (!shelf) throw new AppException('PUTAWAY_SHELF_NOT_FOUND');
    if (shelf.isStaging) throw new AppException('PUTAWAY_SHELF_IS_STAGING');

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

    const packageSpec = line.packageSpec;
    if (!packageSpec) throw new AppException('PUTAWAY_PACKAGE_SPEC_REQUIRED');
    // quantity = số thùng nguyên cần cất — không còn nhân factor (quyết định:
    // quantity luôn là thùng, factor chỉ để hiển thị).
    const quantity = dto.quantity ?? 0;
    if (quantity <= 0) {
      throw new AppException('PUTAWAY_PACKAGE_COUNT_REQUIRED');
    }
    if (
      packageSpec.depthCm > cell.innerDepth ||
      packageSpec.widthCm > cell.innerWidth ||
      packageSpec.heightCm > cell.innerHeight
    ) {
      throw new AppException('PUTAWAY_CELL_DIMENSION_MISMATCH');
    }
    if (quantity > line.remainingQty) {
      throw new AppException('PUTAWAY_QTY_EXCEEDS');
    }

    const sourceShelfId =
      task.sourceShelfId ?? (await this.locationService.findStagingShelf())._id;
    const suggestedCellId = dto.suggestedCellId
      ? new Types.ObjectId(dto.suggestedCellId)
      : null;
    const isOverride =
      suggestedCellId !== null &&
      suggestedCellId.toString() !== cell._id.toString();

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      const activeCell = await this.locationRepo.lockActiveCellForInventory(
        cell._id.toString(),
        session,
      );
      if (!activeCell) throw new AppException('PUTAWAY_CELL_NOT_FOUND');
      const activeShelf = await this.locationRepo.lockActiveShelfForInventory(
        activeCell.shelfId.toString(),
        session,
      );
      if (!activeShelf) throw new AppException('PUTAWAY_SHELF_NOT_FOUND');
      if (activeShelf.isStaging) {
        throw new AppException('PUTAWAY_SHELF_IS_STAGING');
      }
      if (activeShelf.rackId.toString() !== activeCell.rackId.toString()) {
        throw new AppException('PUTAWAY_ZONE_NOT_ALLOWED');
      }
      const rack = await this.locationRepo.lockActiveRackForInventory(
        activeCell.rackId.toString(),
        session,
      );
      const zone = rack
        ? await this.locationRepo.lockActiveZoneForInventory(
            rack.zoneId.toString(),
            session,
          )
        : null;
      if (!zone || zone.zonePurpose === ZonePurpose.SCRAP) {
        throw new AppException('PUTAWAY_ZONE_NOT_ALLOWED');
      }
      const allowedItemTypes = zone.allowedItemTypes ?? [];
      if (
        allowedItemTypes.length > 0 &&
        !allowedItemTypes.includes(item.type)
      ) {
        throw new AppException('PUTAWAY_ITEM_TYPE_NOT_ALLOWED');
      }

      const activeSourceShelf =
        await this.locationRepo.lockActiveShelfForInventory(
          sourceShelfId.toString(),
          session,
        );
      if (!activeSourceShelf || !activeSourceShelf.isStaging) {
        throw new AppException('PUTAWAY_SHELF_NOT_FOUND');
      }
      const sourceRack = await this.locationRepo.lockActiveRackForInventory(
        activeSourceShelf.rackId.toString(),
        session,
      );
      const sourceZone = sourceRack
        ? await this.locationRepo.lockActiveZoneForInventory(
            sourceRack.zoneId.toString(),
            session,
          )
        : null;
      if (!sourceZone || sourceZone.zonePurpose === ZonePurpose.SCRAP) {
        throw new AppException('PUTAWAY_ZONE_NOT_ALLOWED');
      }

      if (
        packageSpec.depthCm > activeCell.innerDepth ||
        packageSpec.widthCm > activeCell.innerWidth ||
        packageSpec.heightCm > activeCell.innerHeight
      ) {
        throw new AppException('PUTAWAY_CELL_DIMENSION_MISMATCH');
      }
      const occupiedVolume = await this.stockRepo.findOccupiedVolumeForCell(
        activeCell._id,
        session,
      );
      const usableVolume =
        activeCell.innerDepth *
        activeCell.innerWidth *
        activeCell.innerHeight *
        (activeCell.fillFactor ?? 0.75);
      const incomingVolume = quantity * packageSpec.volumeCm3;
      if (occupiedVolume + incomingVolume > usableVolume) {
        throw new AppException('PUTAWAY_CELL_CAPACITY_EXCEEDED');
      }

      const stagingUpdated = await this.stockRepo.decrementInventoryIfAvailable(
        item._id,
        activeSourceShelf._id,
        null,
        lotId,
        quantity,
        session,
      );
      if (!stagingUpdated) throw new AppException('STOCK_INSUFFICIENT');
      await this.stockRepo.upsertInventory(
        item._id,
        activeShelf._id,
        lotId,
        quantity,
        session,
        {
          cellId: activeCell._id,
          packageFactor: line.packageSpec?.factor,
          packageVolumeCm3Snapshot: line.packageSpec?.volumeCm3,
        },
      );
      await this.stockRepo.insertMovement(
        {
          itemId: item._id,
          shelfId: activeSourceShelf._id,
          lotId,
          type: MovementType.PUTAWAY,
          quantity: -quantity,
          refType: 'put_away_task',
          refId: task._id,
          createdBy: new Types.ObjectId(actorId),
        },
        session,
      );
      await this.stockRepo.insertMovement(
        {
          itemId: item._id,
          shelfId: activeShelf._id,
          cellId: activeCell._id,
          lotId,
          type: MovementType.PUTAWAY,
          quantity,
          refType: 'put_away_task',
          refId: task._id,
          createdBy: new Types.ObjectId(actorId),
          packageFactor: line.packageSpec?.factor,
          packageVolumeCm3Snapshot: line.packageSpec?.volumeCm3,
          suggestedCellId,
          actualCellId: activeCell._id,
          isOverride,
        },
        session,
      );
      const taskUpdated = await this.repo.decrementRemainingQty(
        taskId,
        item._id,
        lotId,
        quantity,
        session,
      );
      if (!taskUpdated) throw new AppException('PUTAWAY_QTY_EXCEEDS');
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
