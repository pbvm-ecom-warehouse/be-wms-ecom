import { Injectable } from '@nestjs/common';
import { LotStatus } from '../stock/schemas/lot.schema';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import {
  ItemFilter,
  LotItemFilter,
  PerformanceFilter,
  ReportRepository,
} from './report.repository';
import { QueryStockReportDto } from './dto/query-stock-report.dto';
import { QueryLotReportDto } from './dto/query-lot-report.dto';
import { QueryPerformanceReportDto } from './dto/query-performance-report.dto';
import {
  ExpiryFlag,
  LotReportItemDto,
  PerformanceReportItemDto,
  StockReportItemDto,
} from './dto/report.response.dto';

const DEFAULT_NEAR_EXPIRY_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_PERFORMANCE_RANGE_DAYS = 30;

@Injectable()
export class ReportService {
  constructor(private readonly repo: ReportRepository) {}

  async getStockReport(
    query: QueryStockReportDto,
  ): Promise<{ data: StockReportItemDto[]; total: number }> {
    const filter: ItemFilter = {};
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
          quantity: row.quantity,
          status: row.lot.status,
          expiryFlag,
        };
      }),
      total,
    };
  }

  async getPerformanceReport(
    query: QueryPerformanceReportDto,
  ): Promise<PerformanceReportItemDto[]> {
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const dateFrom = query.dateFrom
      ? new Date(query.dateFrom)
      : new Date(
          dateTo.getTime() - DEFAULT_PERFORMANCE_RANGE_DAYS * MS_PER_DAY,
        );

    const filter: PerformanceFilter = { dateFrom, dateTo };

    const zeroFilled = (): PerformanceReportItemDto[] =>
      Object.values(MovementType).map((type) => ({
        type,
        totalQuantity: 0,
        movementCount: 0,
      }));

    if (query.sku) {
      const item = await this.repo.findItemIdBySku(query.sku);
      if (!item) return zeroFilled();
      filter.itemId = item._id;
    }

    const rows = await this.repo.aggregatePerformanceReport(filter);
    const rowByType = new Map(rows.map((r) => [r._id, r]));
    return Object.values(MovementType).map((type) => {
      const row = rowByType.get(type);
      return {
        type,
        totalQuantity: row?.totalQuantity ?? 0,
        movementCount: row?.movementCount ?? 0,
      };
    });
  }
}
