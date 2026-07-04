import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  InventoryStock,
  InventoryStockDocument,
} from './schemas/inventory-stock.schema';
import { Lot, LotDocument, LotStatus } from './schemas/lot.schema';
import { MovementType, StockMovement } from './schemas/stock-movement.schema';
import {
  StockBalance,
  StockBalanceDocument,
} from './schemas/stock-balance.schema';
import { ItemType, WarehouseItem, WarehouseItemDocument } from './schemas/warehouse-item.schema';

type InsertMovementData = {
  itemId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  shelfId: Types.ObjectId;
  lotId: Types.ObjectId | null;
  type: MovementType;
  quantity: number;
  refType: string;
  refId: Types.ObjectId;
  createdBy: Types.ObjectId;
};

export type CreateWarehouseItemData = {
  sku: string;
  barcode?: string;
  altBarcodes?: string[];
  name: string;
  type: ItemType;
  unit: string;
  altUnits?: { unit: string; factor: number }[];
  attributes?: { name: string; value: string; code: string }[];
  isPerishable?: boolean;
  nearExpiryDays?: number;
};

@Injectable()
export class StockRepository {
  constructor(
    @InjectModel(WarehouseItem.name)
    private readonly itemModel: Model<WarehouseItem>,
    @InjectModel(StockBalance.name)
    private readonly balanceModel: Model<StockBalance>,
    @InjectModel(InventoryStock.name)
    private readonly inventoryModel: Model<InventoryStock>,
    @InjectModel(Lot.name)
    private readonly lotModel: Model<Lot>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovement>,
  ) {}

  /** Lấy sku của một mặt hàng theo id — dùng khi publish stock.changed. */
  findSkuById(itemId: string) {
    return this.itemModel.findById(itemId).select('sku').lean().exec();
  }

  /** Đọc đầy đủ WarehouseItem theo id — dùng khi GRN cần isPerishable/altUnits/unit. */
  findItemById(itemId: string) {
    return this.itemModel.findById(itemId).lean().exec();
  }

  /** Tra WarehouseItem theo barcode chính hoặc altBarcodes — dùng khi RECEIVER quét SKU lúc put-away. */
  findItemByBarcode(barcode: string) {
    return this.itemModel
      .findOne({ $or: [{ barcode }, { altBarcodes: barcode }] })
      .lean()
      .exec();
  }

  findBalanceByItemAndWarehouse(
    itemId: Types.ObjectId,
    warehouseId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<StockBalanceDocument | null> {
    return this.balanceModel
      .findOne({ itemId, warehouseId }, null, { session })
      .exec();
  }

  /**
   * Upsert StockBalance: cộng dồn delta vào onHand, reservedDelta vào reserved,
   * expiredDelta vào expired. Dùng $inc để atomic.
   */
  upsertBalance(
    itemId: Types.ObjectId,
    warehouseId: Types.ObjectId,
    onHandDelta: number,
    reservedDelta: number,
    expiredDelta: number,
    session?: ClientSession,
  ): Promise<StockBalanceDocument | null> {
    return this.balanceModel
      .findOneAndUpdate(
        { itemId, warehouseId },
        {
          $inc: {
            onHand: onHandDelta,
            reserved: reservedDelta,
            expired: expiredDelta,
          },
        },
        { upsert: true, new: true, session },
      )
      .exec();
  }

  findInventory(
    itemId: Types.ObjectId,
    warehouseId: Types.ObjectId,
    shelfId: Types.ObjectId,
    lotId: Types.ObjectId | null,
    session?: ClientSession,
  ): Promise<InventoryStockDocument | null> {
    return this.inventoryModel
      .findOne({ itemId, warehouseId, shelfId, lotId }, null, { session })
      .exec();
  }

  /** Upsert InventoryStock: cộng dồn deltaQty vào quantity. */
  upsertInventory(
    itemId: Types.ObjectId,
    warehouseId: Types.ObjectId,
    shelfId: Types.ObjectId,
    lotId: Types.ObjectId | null,
    deltaQty: number,
    session?: ClientSession,
  ): Promise<InventoryStockDocument | null> {
    return this.inventoryModel
      .findOneAndUpdate(
        { itemId, warehouseId, shelfId, lotId },
        { $inc: { quantity: deltaQty } },
        { upsert: true, new: true, session },
      )
      .exec();
  }

  findActiveLotByNumber(
    itemId: Types.ObjectId,
    lotNumber: string,
    session?: ClientSession,
  ): Promise<LotDocument | null> {
    return this.lotModel
      .findOne({ itemId, lotNumber, status: LotStatus.ACTIVE }, null, {
        session,
      })
      .exec();
  }

  async createLot(
    data: {
      itemId: Types.ObjectId;
      lotNumber: string;
      expiryDate: Date;
      receivedDate: Date;
    },
    session?: ClientSession,
  ): Promise<LotDocument> {
    const [doc] = await this.lotModel.create([data], { session });
    return doc;
  }

  async insertMovement(
    data: InsertMovementData,
    session?: ClientSession,
  ): Promise<void> {
    await this.movementModel.create([data], { session });
  }

  /** Tra WarehouseItem theo sku — dùng khi tạo mới để chặn trùng sku (kể cả đã soft-delete). */
  findItemBySku(sku: string) {
    return this.itemModel.findOne({ sku }).lean().exec();
  }

  /** Tạo mới WarehouseItem (master data). isActive mặc định true. */
  async createItem(
    data: CreateWarehouseItemData,
    createdBy: Types.ObjectId,
  ): Promise<WarehouseItemDocument> {
    const [doc] = await this.itemModel.create([
      { ...data, createdBy, isActive: true },
    ]);
    return doc;
  }
}
