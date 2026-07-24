import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';
import { GoodsReceiptNoteStatus } from '../schemas/goods-receipt-note.schema';

export class CreateGoodsReceiptNoteItemDto {
  @ApiProperty({
    description: 'WarehouseItem._id (ObjectId)',
    example: '665f...',
  })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 100, description: 'Số lượng thực nhận' })
  @IsNumber()
  @Min(0)
  actualQty!: number;

  @ApiProperty({ example: 'cái' })
  @IsString()
  @MinLength(1)
  unit!: string;

  @ApiPropertyOptional({
    example: 'L240601',
    description: 'Bắt buộc nếu WarehouseItem.isPerishable',
  })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({
    example: '2026-12-01',
    description: 'Bắt buộc nếu WarehouseItem.isPerishable',
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ example: 'Thiếu 2 cái so với PO' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateGoodsReceiptNoteDto {
  @ApiProperty({
    description: 'PurchaseOrder._id (ObjectId)',
    example: '665f...',
  })
  @IsMongoId()
  purchaseOrderId!: string;

  @ApiProperty({ type: [CreateGoodsReceiptNoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptNoteItemDto)
  items!: CreateGoodsReceiptNoteItemDto[];
}

export class QueryGoodsReceiptNoteDto {
  @ApiPropertyOptional({ enum: GoodsReceiptNoteStatus })
  @IsOptional()
  @IsEnum(GoodsReceiptNoteStatus)
  status?: GoodsReceiptNoteStatus;

  @ApiPropertyOptional({ description: 'Lọc theo PO' })
  @IsOptional()
  @IsMongoId()
  purchaseOrderId?: string;

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

export class GoodsReceiptNoteItemResponseDto {
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
  expectedQty!: number;

  @Expose()
  @ApiProperty()
  actualQty!: number;

  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @ApiPropertyOptional()
  lotNumber?: string;

  @Expose()
  @ApiPropertyOptional()
  expiryDate?: Date;

  @Expose()
  @ApiPropertyOptional()
  note?: string;
}

export class GoodsReceiptNoteResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  grnNumber!: string;

  @Expose()
  @Transform(({ obj }: { obj: { purchaseOrderId?: Types.ObjectId } }) =>
    obj.purchaseOrderId?.toString(),
  )
  @ApiProperty()
  purchaseOrderId!: string;

  @Expose()
  @ApiProperty({ enum: GoodsReceiptNoteStatus })
  status!: GoodsReceiptNoteStatus;

  @Expose()
  @Type(() => GoodsReceiptNoteItemResponseDto)
  @ApiProperty({ type: [GoodsReceiptNoteItemResponseDto] })
  items!: GoodsReceiptNoteItemResponseDto[];

  @Expose()
  @ApiProperty({ type: [String] })
  images!: string[];

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
