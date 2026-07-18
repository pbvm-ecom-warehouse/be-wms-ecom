import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, WmsRole } from '@app/auth';
import { buildOffsetMeta, PaginatedResult } from '@app/common';
import { plainToInstance } from 'class-transformer';
import { ReportService } from './report.service';
import { QueryStockReportDto } from './dto/query-stock-report.dto';
import { QueryLotReportDto } from './dto/query-lot-report.dto';
import { QueryPerformanceReportDto } from './dto/query-performance-report.dto';
import {
  LotReportItemDto,
  PerformanceReportItemDto,
  StockReportItemDto,
} from './dto/report.response.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly svc: ReportService) {}

  @Get('stock')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary: 'Báo cáo tồn kho theo SKU + kho — [ADMIN, MANAGER]',
  })
  @ApiOkResponse({ type: [StockReportItemDto] })
  async getStockReport(
    @Query() query: QueryStockReportDto,
  ): Promise<PaginatedResult<StockReportItemDto>> {
    const { data, total } = await this.svc.getStockReport(query);
    const items = plainToInstance(StockReportItemDto, data, TO_OPTS);
    return new PaginatedResult(
      items,
      buildOffsetMeta(items.length, query.page, query.limit, total),
    );
  }

  @Get('stock/lots')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary:
      'Báo cáo tồn theo lô — kèm cảnh báo sắp/đã hết hạn — [ADMIN, MANAGER]',
  })
  @ApiOkResponse({ type: [LotReportItemDto] })
  async getLotReport(
    @Query() query: QueryLotReportDto,
  ): Promise<PaginatedResult<LotReportItemDto>> {
    const { data, total } = await this.svc.getLotReport(query);
    const items = plainToInstance(LotReportItemDto, data, TO_OPTS);
    return new PaginatedResult(
      items,
      buildOffsetMeta(items.length, query.page, query.limit, total),
    );
  }

  @Get('performance')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary:
      'Báo cáo hiệu suất nhập/xuất/điều chỉnh theo khoảng ngày — [ADMIN, MANAGER]',
  })
  @ApiOkResponse({ type: [PerformanceReportItemDto] })
  async getPerformanceReport(
    @Query() query: QueryPerformanceReportDto,
  ): Promise<PerformanceReportItemDto[]> {
    const data = await this.svc.getPerformanceReport(query);
    return plainToInstance(PerformanceReportItemDto, data, TO_OPTS);
  }
}
