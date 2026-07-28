import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

/** Multipart form gửi mảng/object dạng JSON string — parse trước khi validate.
 * Giữ nguyên giá trị nếu đã là mảng (request JSON thường không qua multipart). */
function parseJsonArrayIfString({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Multipart form gửi boolean dạng string "true"/"false" — Boolean("false") vẫn
 * truthy nên không dùng @Type(() => Boolean) được, phải so chuỗi thủ công. */
function parseBooleanIfString({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

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
  @Transform(parseJsonArrayIfString)
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  attributeOptionIds!: string[];

  @ApiProperty({ example: 'Ly nhựa 500ml' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    example: 'thùng',
    description: 'Đơn vị chính — dùng để nhập kho (GRN) và mua hàng (PO).',
  })
  @IsString()
  @MinLength(1)
  unit!: string;

  @ApiProperty({
    type: [AltUnitDto],
    description:
      'Đơn vị chính (unit) luôn là thùng dùng để nhập/mua — bắt buộc khai đúng 1 đơn vị lẻ để quy đổi.',
  })
  @Transform(parseJsonArrayIfString)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @ValidateNested({ each: true })
  @Type(() => AltUnitDto)
  altUnits!: AltUnitDto[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(parseBooleanIfString)
  @IsBoolean()
  isPerishable?: boolean;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nearExpiryDays?: number;

  @ApiPropertyOptional({
    example: 10,
    description:
      'Ngưỡng tối thiểu — available dưới ngưỡng này thì phát cảnh báo stock.low',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minQuantity?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Chiều sâu 1 đơn vị cơ sở (cm)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  depth?: number;

  @ApiPropertyOptional({
    example: 8,
    description: 'Chiều rộng 1 đơn vị cơ sở (cm)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  width?: number;

  @ApiPropertyOptional({
    example: 12,
    description: 'Chiều cao 1 đơn vị cơ sở (cm)',
  })
  @IsOptional()
  @Type(() => Number)
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
