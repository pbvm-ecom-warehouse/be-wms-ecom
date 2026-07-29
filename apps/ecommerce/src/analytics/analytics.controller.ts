import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, EcomRole } from '@app/auth';
import { plainToInstance } from 'class-transformer';
import { AnalyticsService } from './analytics.service';
import {
  OverviewAnalyticsResponseDto,
  TopSellingItemResponseDto,
  TopSellingQueryDto,
  DailyRevenueItemResponseDto,
  RevenueTimelineQueryDto,
  MonthlyComparisonResponseDto,
} from './dto/analytics.dto';

@ApiTags('admin-analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(EcomRole.ECOM_MANAGER)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({
    summary: '[Admin] Thống kê tổng quan báo cáo kinh doanh & tồn kho',
  })
  @ApiOkResponse({ type: OverviewAnalyticsResponseDto })
  async getOverview() {
    const data = await this.analyticsService.getOverview();
    return plainToInstance(OverviewAnalyticsResponseDto, data, {
      excludeExtraneousValues: true,
    });
  }

  @Get('top-selling')
  @ApiOperation({
    summary: '[Admin] Thống kê top sản phẩm/SKU bán chạy nhất',
  })
  @ApiOkResponse({ type: [TopSellingItemResponseDto] })
  async getTopSelling(@Query() query: TopSellingQueryDto) {
    const data = await this.analyticsService.getTopSelling(query.limit);
    return plainToInstance(TopSellingItemResponseDto, data, {
      excludeExtraneousValues: true,
    });
  }

  @Get('revenue')
  @ApiOperation({
    summary: '[Admin] Thống kê biến động doanh thu theo thời gian (theo ngày)',
  })
  @ApiOkResponse({ type: [DailyRevenueItemResponseDto] })
  async getRevenueTimeline(@Query() query: RevenueTimelineQueryDto) {
    const data = await this.analyticsService.getRevenueTimeline(
      query.fromDate,
      query.toDate,
    );
    return plainToInstance(DailyRevenueItemResponseDto, data, {
      excludeExtraneousValues: true,
    });
  }

  @Get('monthly-comparison')
  @ApiOperation({
    summary: '[Admin] So sánh hiệu năng tháng này và tháng trước (doanh thu, đơn hàng, khách mới, AOV) kèm tỷ lệ tăng trưởng',
  })
  @ApiOkResponse({ type: MonthlyComparisonResponseDto })
  async getMonthlyComparison() {
    const data = await this.analyticsService.getMonthlyComparison();
    return plainToInstance(MonthlyComparisonResponseDto, data, {
      excludeExtraneousValues: true,
    });
  }
}
