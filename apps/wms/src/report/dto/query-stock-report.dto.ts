import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OffsetPaginationQuery } from '@app/common';

export class QueryStockReportDto extends OffsetPaginationQuery {
  @ApiPropertyOptional({ description: 'Lọc theo sku (khớp chính xác)' })
  @IsOptional()
  @IsString()
  sku?: string;
}
