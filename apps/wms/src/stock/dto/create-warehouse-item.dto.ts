import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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

export class ItemAttributeDto {
  @ApiProperty({ example: 'Màu' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'Đỏ' })
  @IsString()
  @MinLength(1)
  value!: string;

  @ApiProperty({ example: 'COLOR' })
  @IsString()
  @MinLength(1)
  code!: string;
}

export class CreateWarehouseItemDto {
  @ApiProperty({ example: 'CUP-500ML-RED' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional({ example: '8938501234567' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ type: [String], example: ['8938501234567'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  altBarcodes?: string[];

  @ApiProperty({ example: 'Ly nhựa 500ml' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: ItemType, example: ItemType.CUP_BLANK })
  @IsEnum(ItemType)
  type!: ItemType;

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

  @ApiPropertyOptional({ type: [ItemAttributeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAttributeDto)
  attributes?: ItemAttributeDto[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPerishable?: boolean;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  nearExpiryDays?: number;

  @ApiPropertyOptional({ example: 10, description: 'Chiều sâu 1 đơn vị cơ sở (cm)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  depth?: number;

  @ApiPropertyOptional({ example: 8, description: 'Chiều rộng 1 đơn vị cơ sở (cm)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @ApiPropertyOptional({ example: 12, description: 'Chiều cao 1 đơn vị cơ sở (cm)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;
}
