import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ItemType } from '../schemas/warehouse-item.schema';

export class AltUnitDto {
  @ApiProperty({ example: 'thùng' })
  @IsString()
  @MinLength(1)
  unit!: string;

  @ApiProperty({
    example: 24,
    description: '1 altUnit = factor * đơn vị cơ sở',
  })
  @IsInt()
  @Min(1)
  factor!: number;
}

/**
 * SKU/barcode/attributes KHÔNG nhận từ client (issue #25) — BE tự resolve
 * template + option rồi sinh. type chỉ nhận 3 giá trị public (CUP_PRINTED bị
 * chặn ở service, không khai trong @IsIn để Swagger không gợi ý sai).
 */
export class CreateWarehouseItemDto {
  @ApiProperty({
    enum: [ItemType.CUP_BLANK, ItemType.MATERIAL, ItemType.PACKAGING],
    example: ItemType.CUP_BLANK,
  })
  @IsIn([ItemType.CUP_BLANK, ItemType.MATERIAL, ItemType.PACKAGING])
  type!: ItemType.CUP_BLANK | ItemType.MATERIAL | ItemType.PACKAGING;

  @ApiProperty({
    example: 'CUP_BLANK',
    description: 'Lấy từ GET /stock/item-types/:type/sku-template',
  })
  @IsString()
  @MinLength(1)
  templateId!: string;

  @ApiProperty({ type: [String], example: ['66a1...', '66a2...'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  attributeOptionIds!: string[];

  @ApiProperty({ example: 'Ly nhựa 500ml' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'cái' })
  @IsString()
  @MinLength(1)
  unit!: string;

  @ApiPropertyOptional({ type: [AltUnitDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AltUnitDto)
  altUnits?: AltUnitDto[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPerishable?: boolean;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  nearExpiryDays?: number;

  @ApiPropertyOptional({
    example: 10,
    description:
      'Ngưỡng tối thiểu — available dưới ngưỡng này thì phát cảnh báo stock.low',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantity?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Chiều sâu 1 đơn vị cơ sở (cm)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  depth?: number;

  @ApiPropertyOptional({
    example: 8,
    description: 'Chiều rộng 1 đơn vị cơ sở (cm)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @ApiPropertyOptional({
    example: 12,
    description: 'Chiều cao 1 đơn vị cơ sở (cm)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;
}

export class UpdateWarehouseItemDto extends PartialType(
  OmitType(CreateWarehouseItemDto, [
    'type',
    'templateId',
    'attributeOptionIds',
  ] as const),
) {}
