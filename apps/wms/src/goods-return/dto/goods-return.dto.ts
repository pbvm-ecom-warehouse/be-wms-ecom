import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';
import {
  GoodsReturnItemCondition,
  GoodsReturnStatus,
} from '../schemas/goods-return.schema';

export class CreateGoodsReturnItemDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1a' })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({ example: 2, description: 'Số lượng hoàn trả' })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateGoodsReturnDto {
  @ApiPropertyOptional({
    example: '665f1a2b3c4d5e6f7a8b9c0d',
    description:
      'Đơn Ecommerce gốc — bỏ trống nếu hàng hoàn không gắn đơn cụ thể',
  })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ example: 'Khách trả trực tiếp tại kho' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [CreateGoodsReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReturnItemDto)
  items!: CreateGoodsReturnItemDto[];
}

export class InspectGoodsReturnItemDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1a' })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({ enum: GoodsReturnItemCondition })
  @IsEnum(GoodsReturnItemCondition)
  condition!: GoodsReturnItemCondition;

  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1c' })
  @IsMongoId()
  shelfId!: string;

  @ApiPropertyOptional({
    example: '665f1a2b3c4d5e6f7a8b9c1b',
    description:
      'Bắt buộc nếu item isPerishable và condition=GOOD (nhập lại hàng tốt phải theo đúng lô còn hạn)',
  })
  @IsOptional()
  @IsMongoId()
  lotId?: string;
}

export class InspectGoodsReturnDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @IsMongoId()
  warehouseId!: string;

  @ApiProperty({ type: [InspectGoodsReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectGoodsReturnItemDto)
  items!: InspectGoodsReturnItemDto[];
}

export class QueryGoodsReturnDto {
  @ApiPropertyOptional({ enum: GoodsReturnStatus })
  @IsOptional()
  @IsEnum(GoodsReturnStatus)
  status?: GoodsReturnStatus;

  @ApiPropertyOptional({ example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional({ example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @IsOptional()
  @IsString()
  orderId?: string;

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

export class GoodsReturnItemResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { itemId?: Types.ObjectId } }) =>
    obj.itemId?.toString(),
  )
  @ApiProperty()
  itemId!: string;

  @Expose()
  @ApiProperty()
  sku!: string;

  @Expose()
  @ApiProperty()
  quantity!: number;

  @Expose()
  @ApiPropertyOptional({ enum: GoodsReturnItemCondition })
  condition!: GoodsReturnItemCondition | null;

  @Expose()
  @Transform(({ obj }: { obj: { shelfId?: Types.ObjectId | null } }) =>
    obj.shelfId ? obj.shelfId.toString() : null,
  )
  @ApiPropertyOptional()
  shelfId!: string | null;

  @Expose()
  @Transform(({ obj }: { obj: { lotId?: Types.ObjectId | null } }) =>
    obj.lotId ? obj.lotId.toString() : null,
  )
  @ApiPropertyOptional()
  lotId!: string | null;

  @Expose()
  @Transform(({ obj }: { obj: { scrapNoteId?: Types.ObjectId | null } }) =>
    obj.scrapNoteId ? obj.scrapNoteId.toString() : null,
  )
  @ApiPropertyOptional()
  scrapNoteId!: string | null;
}

export class GoodsReturnResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiPropertyOptional()
  orderId?: string;

  @Expose()
  @Transform(({ obj }: { obj: { warehouseId?: Types.ObjectId | null } }) =>
    obj.warehouseId ? obj.warehouseId.toString() : null,
  )
  @ApiPropertyOptional()
  warehouseId!: string | null;

  @Expose()
  @ApiProperty({ enum: GoodsReturnStatus })
  status!: GoodsReturnStatus;

  @Expose()
  @ApiPropertyOptional()
  note?: string;

  @Expose()
  @Transform(({ obj }: { obj: { createdBy?: Types.ObjectId | null } }) =>
    obj.createdBy ? obj.createdBy.toString() : null,
  )
  @ApiPropertyOptional()
  createdBy!: string | null;

  @Expose()
  @Type(() => GoodsReturnItemResponseDto)
  @ApiProperty({ type: [GoodsReturnItemResponseDto] })
  items!: GoodsReturnItemResponseDto[];

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
