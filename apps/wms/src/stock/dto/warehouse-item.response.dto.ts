import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ItemType } from '../schemas/warehouse-item.schema';

export class AltUnitResponseDto {
  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @ApiProperty()
  factor!: number;
}

export class ItemAttributeResponseDto {
  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  value!: string;

  @Expose()
  @ApiProperty()
  code!: string;
}

export class WarehouseItemResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  sku!: string;

  @Expose()
  @ApiPropertyOptional()
  barcode?: string;

  @Expose()
  @ApiProperty({ type: [String] })
  altBarcodes!: string[];

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty({ enum: ItemType })
  type!: ItemType;

  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @Type(() => AltUnitResponseDto)
  @ApiProperty({ type: [AltUnitResponseDto] })
  altUnits!: AltUnitResponseDto[];

  @Expose()
  @Type(() => ItemAttributeResponseDto)
  @ApiProperty({ type: [ItemAttributeResponseDto] })
  attributes!: ItemAttributeResponseDto[];

  @Expose()
  @ApiProperty()
  isPerishable!: boolean;

  @Expose()
  @ApiPropertyOptional()
  nearExpiryDays?: number;

  @Expose()
  @ApiPropertyOptional()
  depth?: number;

  @Expose()
  @ApiPropertyOptional()
  width?: number;

  @Expose()
  @ApiPropertyOptional()
  height?: number;

  @Expose()
  @ApiProperty()
  isActive!: boolean;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
