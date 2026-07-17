import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { WarehouseItem } from '../stock/schemas/warehouse-item.schema';
import { StockBalance } from '../stock/schemas/stock-balance.schema';
import { InventoryStock } from '../stock/schemas/inventory-stock.schema';
import { StockMovement } from '../stock/schemas/stock-movement.schema';
import { LotStatus } from '../stock/schemas/lot.schema';

export interface ItemFilter {
  warehouseId?: Types.ObjectId;
  itemId?: Types.ObjectId;
}

export interface ItemSkuLookup {
  _id: Types.ObjectId;
  nearExpiryDays?: number;
}

export interface RawStockReportRow {
  itemId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  onHand: number;
  reserved: number;
  expired: number;
  item: { sku: string; name: string };
  warehouse: { name: string };
}

export interface LotItemFilter extends ItemFilter {
  status?: LotStatus;
}

export interface RawLotReportRow {
  _id: { lotId: Types.ObjectId; warehouseId: Types.ObjectId };
  itemId: Types.ObjectId;
  quantity: number;
  lot: { lotNumber: string; expiryDate: Date; status: LotStatus };
  item: { sku: string; name: string; nearExpiryDays?: number };
  warehouse: { name: string };
}

export interface PerformanceFilter extends ItemFilter {
  dateFrom: Date;
  dateTo: Date;
}

export interface RawPerformanceRow {
  _id: string;
  totalQuantity: number;
  movementCount: number;
}

@Injectable()
export class ReportRepository {
  constructor(
    @InjectModel(WarehouseItem.name)
    private readonly warehouseItemModel: Model<WarehouseItem>,
    @InjectModel(StockBalance.name)
    private readonly stockBalanceModel: Model<StockBalance>,
    @InjectModel(InventoryStock.name)
    private readonly inventoryStockModel: Model<InventoryStock>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovement>,
  ) {}

  /**
   * Resolve sku → itemId (+ nearExpiryDays cho báo cáo lô) — dùng chung cho filter sku ở cả 3 báo cáo.
   * Không filter deletedAt: null — cố ý khác quy ước master data thường, vì báo cáo tồn kho
   * cần hiện cả tồn vật lý của item đã ngừng kinh doanh (soft-delete) để nhân viên dọn kho.
   */
  findItemIdBySku(sku: string): Promise<ItemSkuLookup | null> {
    return this.warehouseItemModel
      .findOne({ sku })
      .select('_id nearExpiryDays')
      .lean<ItemSkuLookup>()
      .exec();
  }

  async aggregateStockReport(
    filter: ItemFilter,
    page: number,
    limit: number,
  ): Promise<{ data: RawStockReportRow[]; total: number }> {
    const match: Record<string, unknown> = {};
    if (filter.warehouseId) match.warehouseId = filter.warehouseId;
    if (filter.itemId) match.itemId = filter.itemId;

    const basePipeline: PipelineStage[] = [
      { $match: match },
      // Không lọc warehouse_items.deletedAt — báo cáo tồn phải hiện cả tồn vật lý
      // của item đã soft-delete (ngừng kinh doanh) để nhân viên biết mà dọn kho.
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
        $lookup: {
          from: 'warehouses',
          localField: 'warehouseId',
          foreignField: '_id',
          as: 'warehouse',
        },
      },
      { $unwind: '$warehouse' },
      { $sort: { 'item.sku': 1 } },
    ];

    const [data, totalResult] = await Promise.all([
      this.stockBalanceModel
        .aggregate<RawStockReportRow>([
          ...basePipeline,
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ])
        .exec(),
      this.stockBalanceModel
        .aggregate<{ total: number }>([...basePipeline, { $count: 'total' }])
        .exec(),
    ]);

    return { data, total: totalResult[0]?.total ?? 0 };
  }

  async aggregateLotReport(
    filter: LotItemFilter,
    page: number,
    limit: number,
  ): Promise<{ data: RawLotReportRow[]; total: number }> {
    const match: Record<string, unknown> = { lotId: { $ne: null } };
    if (filter.warehouseId) match.warehouseId = filter.warehouseId;
    if (filter.itemId) match.itemId = filter.itemId;

    const basePipeline: PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: { lotId: '$lotId', warehouseId: '$warehouseId' },
          itemId: { $first: '$itemId' },
          quantity: { $sum: '$quantity' },
        },
      },
      {
        $lookup: {
          from: 'lots',
          localField: '_id.lotId',
          foreignField: '_id',
          as: 'lot',
        },
      },
      { $unwind: '$lot' },
      // Không lọc warehouse_items.deletedAt — cùng lý do với aggregateStockReport.
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
        $lookup: {
          from: 'warehouses',
          localField: '_id.warehouseId',
          foreignField: '_id',
          as: 'warehouse',
        },
      },
      { $unwind: '$warehouse' },
    ];
    if (filter.status) {
      basePipeline.push({ $match: { 'lot.status': filter.status } });
    }
    basePipeline.push({ $sort: { 'lot.expiryDate': 1 } });

    const [data, totalResult] = await Promise.all([
      this.inventoryStockModel
        .aggregate<RawLotReportRow>([
          ...basePipeline,
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ])
        .exec(),
      this.inventoryStockModel
        .aggregate<{ total: number }>([...basePipeline, { $count: 'total' }])
        .exec(),
    ]);

    return { data, total: totalResult[0]?.total ?? 0 };
  }

  aggregatePerformanceReport(
    filter: PerformanceFilter,
  ): Promise<RawPerformanceRow[]> {
    const match: Record<string, unknown> = {
      createdAt: { $gte: filter.dateFrom, $lte: filter.dateTo },
    };
    if (filter.warehouseId) match.warehouseId = filter.warehouseId;
    if (filter.itemId) match.itemId = filter.itemId;

    return this.stockMovementModel
      .aggregate<RawPerformanceRow>([
        { $match: match },
        {
          $group: {
            _id: '$type',
            totalQuantity: { $sum: '$quantity' },
            movementCount: { $sum: 1 },
          },
        },
      ])
      .exec();
  }
}
