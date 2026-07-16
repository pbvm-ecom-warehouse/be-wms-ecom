import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { OffsetPaginationQuery } from '@app/common';

export class QueryStockReportDto extends OffsetPaginationQuery {
  @ApiPropertyOptional({ description: 'Lọc theo kho' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo sku (khớp chính xác)' })
  @IsOptional()
  @IsString()
  sku?: string;
}
