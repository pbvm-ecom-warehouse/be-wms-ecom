import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReportRepository, ItemFilter } from './report.repository';
import { QueryStockReportDto } from './dto/query-stock-report.dto';
import { StockReportItemDto } from './dto/report.response.dto';

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
}
