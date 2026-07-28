import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '@app/common/errors/app.exception';
import { StockRepository } from '../stock/stock.repository';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { LocationRepository } from '../location/location.repository';
import type { AssignInventoryCellDto } from './dto/inventory-reconciliation.dto';
import {
  InventoryCellAssignment,
  type InventoryCellAssignmentDocument,
} from './schemas/inventory-cell-assignment.schema';

@Injectable()
export class InventoryReconciliationService {
  constructor(
    private readonly stockRepo: StockRepository,
    private readonly locationRepo: LocationRepository,
    private readonly txHelper: StockTransactionHelper,
    @InjectModel(InventoryCellAssignment.name)
    private readonly assignmentModel: Model<InventoryCellAssignmentDocument>,
  ) {}

  listUnassigned() {
    return this.stockRepo.findUnassignedInventoryRows();
  }

  async getProgress() {
    const progress = await this.stockRepo.getInventoryCellProgress();
    const total = progress.assignedBaseQty + progress.unassignedBaseQty;
    return {
      ...progress,
      assignedPercent:
        total === 0
          ? 100
          : Math.round((progress.assignedBaseQty / total) * 100),
      requiresCellScan: progress.unassignedBaseQty === 0,
    };
  }

  async assign(dto: AssignInventoryCellDto, actorId: string) {
    // quantity = số thùng nguyên do client gửi trực tiếp — không còn quy đổi
    // qua factor (quyết định: quantity luôn là thùng, factor chỉ để hiển thị).
    const quantity = dto.quantity;
    await this.txHelper.withStockTransaction(async (session) => {
      const source = await this.stockRepo.findInventoryById(
        dto.inventoryId,
        session,
      );
      if (!source || source.cellId || source.quantity <= 0) {
        throw new AppException('UNASSIGNED_INVENTORY_NOT_FOUND');
      }
      if (source.quantity < quantity) {
        throw new AppException('UNASSIGNED_INVENTORY_QTY_EXCEEDS');
      }

      const cell = await this.locationRepo.findCellByCode(
        dto.cellBarcode,
        session,
      );
      if (!cell) throw new AppException('STORAGE_CELL_NOT_FOUND');
      const activeCell = await this.locationRepo.lockActiveCellForInventory(
        cell._id.toString(),
        session,
      );
      if (!activeCell) throw new AppException('STORAGE_CELL_NOT_FOUND');
      if (
        dto.packageDepthCm > activeCell.innerDepth ||
        dto.packageWidthCm > activeCell.innerWidth ||
        dto.packageHeightCm > activeCell.innerHeight
      ) {
        throw new AppException('STORAGE_CELL_DIMENSION_MISMATCH');
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
      if (occupiedVolume + quantity * dto.packageVolumeCm3 > usableVolume) {
        throw new AppException('STORAGE_CELL_CAPACITY_EXCEEDED');
      }

      const updatedSource = await this.stockRepo.decrementUnassignedInventory(
        dto.inventoryId,
        quantity,
        session,
      );
      if (!updatedSource) {
        throw new AppException('UNASSIGNED_INVENTORY_QTY_EXCEEDS');
      }
      await this.stockRepo.upsertInventory(
        source.itemId,
        activeCell.shelfId,
        source.lotId,
        quantity,
        session,
        {
          cellId: activeCell._id,
          packageFactor: source.packageFactor,
          packageVolumeCm3Snapshot: dto.packageVolumeCm3,
        },
      );
      await this.assignmentModel.create(
        [
          {
            sourceInventoryId: source._id,
            itemId: source.itemId,
            sourceShelfId: source.shelfId,
            actualShelfId: activeCell.shelfId,
            cellId: activeCell._id,
            lotId: source.lotId,
            quantity,
            packageFactor: source.packageFactor,
            packageVolumeCm3Snapshot: dto.packageVolumeCm3,
            assignedBy: new Types.ObjectId(actorId),
          },
        ],
        { session },
      );
    });

    return this.getProgress();
  }
}
