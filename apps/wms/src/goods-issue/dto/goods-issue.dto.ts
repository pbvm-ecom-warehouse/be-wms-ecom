import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';
import { GoodsIssueStatus } from '../schemas/goods-issue.schema';

export class ConfirmGoodsIssueLineDto {
  @ApiProperty({ example: 'CUP-PLA-500-RED', description: 'Barcode quét SKU' })
  @IsString()
  @MinLength(1)
  itemBarcode!: string;

  @ApiProperty({ example: 'A1-2', description: 'Barcode quét vị trí shelf' })
  @IsString()
  @MinLength(1)
  shelfCode!: string;

  @ApiProperty({ example: 20, description: 'Số lượng xuất từ shelf này' })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Lô hàng — bắt buộc nếu item isPerishable',
  })
  @IsOptional()
  @IsMongoId()
  lotId?: string;
}

export class QueryGoodsIssueDto {
  @ApiPropertyOptional({ enum: GoodsIssueStatus })
  @IsOptional()
  @IsEnum(GoodsIssueStatus)
  status?: GoodsIssueStatus;

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

export class GoodsIssueItemResponseDto {
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
  @ApiProperty()
  remainingQty!: number;
}

export class GoodsIssueResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  orderId!: string;

  @Expose()
  @Transform(({ obj }: { obj: { warehouseId?: Types.ObjectId } }) =>
    obj.warehouseId?.toString(),
  )
  @ApiProperty()
  warehouseId!: string;

  @Expose()
  @ApiProperty({ enum: GoodsIssueStatus })
  status!: GoodsIssueStatus;

  @Expose()
  @Type(() => GoodsIssueItemResponseDto)
  @ApiProperty({ type: [GoodsIssueItemResponseDto] })
  items!: GoodsIssueItemResponseDto[];

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}

export class PickSuggestionResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { shelfId?: Types.ObjectId } }) =>
    obj.shelfId?.toString(),
  )
  @ApiProperty()
  shelfId!: string;

  @Expose()
  @ApiProperty({
    description: 'Barcode dán trên kệ — PICKER quét/đọc để tìm vị trí',
  })
  shelfCode!: string;

  @Expose()
  @Transform(({ obj }: { obj: { lotId?: Types.ObjectId | null } }) =>
    obj.lotId ? obj.lotId.toString() : null,
  )
  @ApiPropertyOptional()
  lotId!: string | null;

  @Expose()
  @ApiPropertyOptional()
  lotNumber!: string | null;

  @Expose()
  @ApiPropertyOptional()
  expiryDate!: Date | null;

  @Expose()
  @ApiProperty()
  quantity!: number;
}
