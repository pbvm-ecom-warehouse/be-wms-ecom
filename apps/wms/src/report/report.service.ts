import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { LotStatus } from '../stock/schemas/lot.schema';
import {
  ItemFilter,
  LotItemFilter,
  ReportRepository,
} from './report.repository';
import { QueryStockReportDto } from './dto/query-stock-report.dto';
import { QueryLotReportDto } from './dto/query-lot-report.dto';
import {
  ExpiryFlag,
  LotReportItemDto,
  StockReportItemDto,
} from './dto/report.response.dto';

const DEFAULT_NEAR_EXPIRY_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportService {
  constructor(private readonly repo: ReportRepository) {}

  async getStockReport(
    query: QueryStockReportDto,
  ): Promise<{ data: StockReportItemDto[]; total: number }> {
    const filter: ItemFilter = {};
    if (query.warehouseId) {
      filter.warehouseId = new Types.ObjectId(query.warehouseId);
    }
    if (query.sku) {
      const item = await this.repo.findItemIdBySku(query.sku);
      if (!item) return { data: [], total: 0 };
      filter.itemId = item._id;
    }

    const { data, total } = await this.repo.aggregateStockReport(
      filter,
      query.page,
      query.limit,
    );

    return {
      data: data.map((row) => ({
        sku: row.item.sku,
        itemName: row.item.name,
        warehouseId: row.warehouseId.toString(),
        warehouseName: row.warehouse.name,
        onHand: row.onHand,
        reserved: row.reserved,
        expired: row.expired,
        available: row.onHand - row.reserved - row.expired,
      })),
      total,
    };
  }

  async getLotReport(
    query: QueryLotReportDto,
  ): Promise<{ data: LotReportItemDto[]; total: number }> {
    const filter: LotItemFilter = {};
    if (query.warehouseId) {
      filter.warehouseId = new Types.ObjectId(query.warehouseId);
    }
    if (query.status) filter.status = query.status;
    if (query.sku) {
      const item = await this.repo.findItemIdBySku(query.sku);
      if (!item) return { data: [], total: 0 };
      filter.itemId = item._id;
    }

    const { data, total } = await this.repo.aggregateLotReport(
      filter,
      query.page,
      query.limit,
    );

    const now = new Date();
    return {
      data: data.map((row) => {
        const nearExpiryDays =
          row.item.nearExpiryDays ?? DEFAULT_NEAR_EXPIRY_DAYS;
        const warningThreshold = new Date(
          now.getTime() + nearExpiryDays * MS_PER_DAY,
        );
        let expiryFlag: ExpiryFlag;
        if (row.lot.status === LotStatus.EXPIRED || row.lot.expiryDate < now) {
          expiryFlag = 'expired';
        } else if (row.lot.expiryDate <= warningThreshold) {
          expiryFlag = 'expiringSoon';
        } else {
          expiryFlag = 'ok';
        }
        return {
          sku: row.item.sku,
          itemName: row.item.name,
          lotNumber: row.lot.lotNumber,
          expiryDate: row.lot.expiryDate,
          warehouseId: row._id.warehouseId.toString(),
          warehouseName: row.warehouse.name,
          quantity: row.quantity,
          status: row.lot.status,
          expiryFlag,
        };
      }),
      total,
    };
  }
}
