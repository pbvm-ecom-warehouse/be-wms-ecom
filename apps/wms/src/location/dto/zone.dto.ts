import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';
import { ItemType } from '../../stock/schemas/warehouse-item.schema';
import { ZonePurpose } from '../schemas/zone.schema';

export class CreateZoneDto {
  @ApiProperty({ example: 'Khu A' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'A' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiPropertyOptional({
    enum: ZonePurpose,
    default: ZonePurpose.STORAGE,
    description: 'STORAGE: lưu trữ thường; SCRAP: cách ly chờ tiêu hủy',
  })
  @IsOptional()
  @IsEnum(ZonePurpose)
  zonePurpose?: ZonePurpose;

  @ApiPropertyOptional({
    enum: ItemType,
    isArray: true,
    default: [],
    description: 'Rỗng nghĩa là khu lưu trữ chung',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ItemType, { each: true })
  allowedItemTypes?: ItemType[];

  @ApiPropertyOptional({ example: 1, description: 'Toạ độ X trên sơ đồ (mét)' })
  @IsOptional()
  @IsNumber()
  xM?: number;

  @ApiPropertyOptional({ example: 1, description: 'Toạ độ Y trên sơ đồ (mét)' })
  @IsOptional()
  @IsNumber()
  yM?: number;

  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @IsNumber()
  widthM?: number;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @IsNumber()
  heightM?: number;

  @ApiPropertyOptional({ example: 0, enum: [0, 90] })
  @IsOptional()
  @IsIn([0, 90])
  rotation?: number;
}

export class UpdateZoneDto extends PartialType(CreateZoneDto) {}

export class ZoneResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty({ enum: ZonePurpose })
  zonePurpose!: ZonePurpose;

  @Expose()
  @ApiProperty({ enum: ItemType, isArray: true })
  allowedItemTypes!: ItemType[];

  @Expose()
  @ApiProperty()
  xM!: number;

  @Expose()
  @ApiProperty()
  yM!: number;

  @Expose()
  @ApiProperty()
  widthM!: number;

  @Expose()
  @ApiProperty()
  heightM!: number;

  @Expose()
  @ApiProperty({ enum: [0, 90] })
  rotation!: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
