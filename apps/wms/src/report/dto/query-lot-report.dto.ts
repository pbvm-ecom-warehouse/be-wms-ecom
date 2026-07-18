import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { OffsetPaginationQuery } from '@app/common';
import { LotStatus } from '../../stock/schemas/lot.schema';

export class QueryLotReportDto extends OffsetPaginationQuery {
  @ApiPropertyOptional({ description: 'Lọc theo kho' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo sku (khớp chính xác)' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ enum: LotStatus })
  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;
}
