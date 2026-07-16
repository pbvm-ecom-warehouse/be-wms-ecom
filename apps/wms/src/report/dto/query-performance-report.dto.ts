import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsMongoId, IsOptional, IsString } from 'class-validator';

export class QueryPerformanceReportDto {
  @ApiPropertyOptional({
    description: 'ISO date bắt đầu, mặc định 30 ngày trước nếu bỏ trống',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'ISO date kết thúc, mặc định thời điểm hiện tại nếu bỏ trống',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Lọc theo kho' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo sku (khớp chính xác)' })
  @IsOptional()
  @IsString()
  sku?: string;
}
