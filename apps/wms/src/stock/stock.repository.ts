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
import {
  ItemType,
  WarehouseItem,
  WarehouseItemDocument,
} from './schemas/warehouse-item.schema';

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
  depth?: number;
  width?: number;
  height?: number;
};

export type QueryWarehouseItemInput = {
  search?: string;
  type?: ItemType;
  isActive?: boolean;
  page?: number;
  limit?: number;
};

export type UpdateWarehouseItemData = Partial<
  Omit<CreateWarehouseItemData, 'sku'>
>;

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

  /** Đọc WarehouseItem theo id, KHÔNG lean — dùng cho controller (cần .toObject() cho response DTO). */
  findItemByIdDocument(itemId: string) {
    return this.itemModel.findById(itemId).exec();
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

  /**
   * Tính thể tích đã chiếm (cm³) của mọi shelf trong 1 kho, group theo shelfId,
   * tổng hợp Σ(quantity × unitVolume) trên mọi SKU/lô của shelf đó. Dòng
   * InventoryStock có item thiếu depth/width/height bị loại khỏi tổng (không
   * throw) — occupied chỉ tính trên item đã khai đủ kích thước.
   * Cố ý KHÔNG lọc item.deletedAt: soft-delete là khái niệm catalog (ẩn khỏi
   * danh mục active), không liên quan việc tồn kho vật lý còn chiếm chỗ trên
   * shelf hay không — occupied phải phản ánh đúng quantity thật trong
   * InventoryStock bất kể item đã soft-delete.
   * quantity > 0 — nhất quán với findShelfIdsWithItem, tránh 2 query cùng đọc
   * InventoryStock nhưng khác điều kiện lọc ngầm định.
   * Map trả về là warehouse-wide (bao gồm cả shelf staging/đã soft-delete),
   * KHÔNG lọc theo trạng thái shelf ở đây vì sẽ cần join thêm sang collection
   * `shelves` mà không đổi kết quả dùng thực tế: caller (PutAwaySuggestionService)
   * chỉ tra map này cho các shelfId đã lấy từ findShelvesByWarehouse (nơi đã lọc
   * staging/deleted/thiếu kích thước) nên các entry ngoài phạm vi candidate
   * đơn giản là không bao giờ được .get().
   */
  async findOccupiedVolumeByWarehouse(
    warehouseId: Types.ObjectId,
  ): Promise<Map<string, number>> {
    const rows = await this.inventoryModel.aggregate<{
      shelfId: string;
      occupied: number;
    }>([
      { $match: { warehouseId, quantity: { $gt: 0 } } },
      {
        $lookup: {
          from: 'warehouse_items',
          localField: 'itemId',
          foreignField: '_id',
          as: 'item',
        },
      },
      { $unwind: '$item' },
      {
        $match: {
          'item.depth': { $exists: true, $ne: null },
          'item.width': { $exists: true, $ne: null },
          'item.height': { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$shelfId',
          occupied: {
            $sum: {
              $multiply: [
                '$quantity',
                { $multiply: ['$item.depth', '$item.width', '$item.height'] },
              ],
            },
          },
        },
      },
      { $project: { _id: 0, shelfId: { $toString: '$_id' }, occupied: 1 } },
    ]);

    return new Map(rows.map((r) => [r.shelfId, r.occupied]));
  }

  /**
   * Danh sách shelf đã có tồn (>0) của 1 item trong kho — dùng xếp hạng ưu tiên
   * SKU-affinity khi gợi ý put-away.
   * quantity > 0 — nhất quán với findOccupiedVolumeByWarehouse, tránh 2 query
   * cùng đọc InventoryStock nhưng khác điều kiện lọc ngầm định.
   */
  async findShelfIdsWithItem(
    itemId: Types.ObjectId,
    warehouseId: Types.ObjectId,
  ): Promise<Set<string>> {
    const shelfIds = await this.inventoryModel
      .distinct('shelfId', { itemId, warehouseId, quantity: { $gt: 0 } })
      .exec();
    return new Set(shelfIds.map((id: Types.ObjectId) => id.toString()));
  }

  /** Danh sách WarehouseItem — filter search (sku/name/barcode) + type + isActive, phân trang. */
  async findItems(
    query: QueryWarehouseItemInput,
  ): Promise<{ data: WarehouseItemDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { deletedAt: null };

    if (query.type) filter['type'] = query.type;
    if (query.isActive !== undefined) filter['isActive'] = query.isActive;
    if (query.search) {
      filter['$or'] = [
        { sku: { $regex: query.search, $options: 'i' } },
        { name: { $regex: query.search, $options: 'i' } },
        { barcode: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .sort({ sku: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.itemModel.countDocuments(filter).exec(),
    ]);
    return { data, total };
  }

  /** Cập nhật WarehouseItem — không sửa sku (bất biến sau khi tạo). */
  async updateItem(
    id: string,
    data: UpdateWarehouseItemData,
    actorId: string,
  ): Promise<WarehouseItemDocument | null> {
    return this.itemModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { ...data, updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      )
      .exec();
  }

  /** Soft-delete WarehouseItem — tự do, không check tham chiếu PO/GRN/InventoryStock. */
  async softDeleteItem(id: string, actorId: string): Promise<boolean> {
    const res = await this.itemModel
      .updateOne(
        { _id: id, deletedAt: null },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }
}
