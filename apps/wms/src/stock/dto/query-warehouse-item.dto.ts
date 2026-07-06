import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ItemType } from '../schemas/warehouse-item.schema';

export class QueryWarehouseItemDto {
  @ApiPropertyOptional({ description: 'Tìm theo sku, name hoặc barcode' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ItemType })
  @IsOptional()
  @IsEnum(ItemType)
  type?: ItemType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    // Query-string luôn là string: "false" vẫn truthy nếu ép bằng Boolean(value),
    // nên phải so sánh tường minh với 'true'/'false'. Giữ nguyên undefined/null
    // để filter isActive không bị áp khi client không truyền param này.
    if (value === undefined || value === null) return value;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
