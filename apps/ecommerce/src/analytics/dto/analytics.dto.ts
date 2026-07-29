import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Expose, Type } from 'class-transformer';

export class RevenueTimelineQueryDto {
  @ApiPropertyOptional({
    example: '2026-07-01',
    description: 'Ngày bắt đầu (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
    description: 'Ngày kết thúc (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  toDate?: string;
}

export class TopSellingQueryDto {
  @ApiPropertyOptional({
    example: 10,
    description: 'Số lượng sản phẩm lấy (mặc định 10)',
  })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class StatusBreakdownDto {
  @Expose()
  @ApiProperty({ example: 'CONFIRMED' })
  status!: string;

  @Expose()
  @ApiProperty({ example: 42 })
  count!: number;
}

export class OverviewAnalyticsResponseDto {
  @Expose()
  @ApiProperty({
    example: 154800000,
    description: 'Tổng doanh thu tích lũy từ đơn PAID (VNĐ)',
  })
  totalRevenue!: number;

  @Expose()
  @ApiProperty({ example: 128, description: 'Tổng số đơn hàng đã đặt' })
  totalOrders!: number;

  @Expose()
  @ApiProperty({ example: 45, description: 'Tổng số khách hàng đăng ký' })
  totalCustomers!: number;

  @Expose()
  @ApiProperty({ example: 12, description: 'Tổng số sản phẩm catalog' })
  totalProducts!: number;

  @Expose()
  @ApiProperty({ example: 34, description: 'Tổng số biến thể sản phẩm' })
  totalVariants!: number;

  @Expose()
  @ApiProperty({
    example: 3,
    description: 'Số lượng biến thể hết hàng (availableQty <= 0)',
  })
  outOfStockVariants!: number;

  @Expose()
  @ApiProperty({
    type: [StatusBreakdownDto],
    description: 'Phân tích đơn hàng theo orderStatus',
  })
  @Type(() => StatusBreakdownDto)
  ordersByOrderStatus!: StatusBreakdownDto[];

  @Expose()
  @ApiProperty({
    type: [StatusBreakdownDto],
    description: 'Phân tích đơn hàng theo paymentStatus',
  })
  @Type(() => StatusBreakdownDto)
  ordersByPaymentStatus!: StatusBreakdownDto[];

  @Expose()
  @ApiProperty({
    type: [StatusBreakdownDto],
    description: 'Phân tích đơn hàng theo fulfillmentStatus',
  })
  @Type(() => StatusBreakdownDto)
  ordersByFulfillmentStatus!: StatusBreakdownDto[];
}

export class TopSellingItemResponseDto {
  @Expose()
  @ApiProperty({ example: 'CUP-PP-350ML' })
  sku!: string;

  @Expose()
  @ApiProperty({ example: 'Ly nhựa PP 350ml' })
  name!: string;

  @Expose()
  @ApiProperty({ example: 150, description: 'Tổng số lượng đã bán' })
  totalQuantitySold!: number;

  @Expose()
  @ApiProperty({ example: 1800000, description: 'Tổng doanh thu tạo ra (VNĐ)' })
  totalRevenue!: number;
}

export class DailyRevenueItemResponseDto {
  @Expose()
  @ApiProperty({ example: '2026-07-21' })
  date!: string;

  @Expose()
  @ApiProperty({ example: 12500000, description: 'Doanh thu trong ngày (VNĐ)' })
  revenue!: number;

  @Expose()
  @ApiProperty({
    example: 8,
    description: 'Số lượng đơn hàng thanh toán trong ngày',
  })
  orderCount!: number;
}

export class MetricComparisonDto {
  @Expose()
  @ApiProperty({ example: 15000000, description: 'Giá trị trong kỳ hiện tại (tháng này)' })
  currentValue!: number;

  @Expose()
  @ApiProperty({ example: 12000000, description: 'Giá trị trong kỳ trước (tháng trước)' })
  previousValue!: number;

  @Expose()
  @ApiProperty({ example: 25.0, description: 'Phần trăm tăng trưởng (tăng: dương, giảm: âm)' })
  growthPercentage!: number;
}

export class MonthlyComparisonResponseDto {
  @Expose()
  @ApiProperty({ type: MetricComparisonDto })
  @Type(() => MetricComparisonDto)
  revenue!: MetricComparisonDto;

  @Expose()
  @ApiProperty({ type: MetricComparisonDto })
  @Type(() => MetricComparisonDto)
  orders!: MetricComparisonDto;

  @Expose()
  @ApiProperty({ type: MetricComparisonDto })
  @Type(() => MetricComparisonDto)
  customers!: MetricComparisonDto;

  @Expose()
  @ApiProperty({ type: MetricComparisonDto })
  @Type(() => MetricComparisonDto)
  aov!: MetricComparisonDto;
}
