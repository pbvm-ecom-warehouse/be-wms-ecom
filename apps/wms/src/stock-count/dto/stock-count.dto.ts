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
} from 'class-validator';
import { Types } from 'mongoose';
import { StockCountStatus } from '../schemas/stock-count.schema';

export class CreateStockCountDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @IsMongoId()
  warehouseId!: string;

  @ApiPropertyOptional({
    example: '665f1a2b3c4d5e6f7a8b9c0e',
    description: 'Bỏ trống = kiểm toàn kho',
  })
  @IsOptional()
  @IsMongoId()
  zoneId?: string;

  @ApiPropertyOptional({ example: 'Kiểm định kỳ quý 3' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CountStockCountItemDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1a' })
  @IsMongoId()
  shelfId!: string;

  @ApiPropertyOptional({ example: '665f1a2b3c4d5e6f7a8b9c1b' })
  @IsOptional()
  @IsMongoId()
  lotId?: string;

  @ApiProperty({ example: 45, description: 'Số lượng đếm được thực tế' })
  @IsNumber()
  @Min(0)
  actualQty!: number;

  @ApiPropertyOptional({
    example: 'Hao hụt do rơi vỡ',
    description: 'Lý do lệch — hư hỏng/mất mát/nhập nhầm...',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ApproveStockCountDto {
  @ApiPropertyOptional({ example: 'Duyệt điều chỉnh theo kiểm kê quý 3' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class QueryStockCountDto {
  @ApiPropertyOptional({ enum: StockCountStatus })
  @IsOptional()
  @IsEnum(StockCountStatus)
  status?: StockCountStatus;

  @ApiPropertyOptional({ example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

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

export class StockCountItemResponseDto {
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
  @Transform(({ obj }: { obj: { shelfId?: Types.ObjectId } }) =>
    obj.shelfId?.toString(),
  )
  @ApiProperty()
  shelfId!: string;

  @Expose()
  @Transform(({ obj }: { obj: { lotId?: Types.ObjectId | null } }) =>
    obj.lotId ? obj.lotId.toString() : null,
  )
  @ApiPropertyOptional()
  lotId!: string | null;

  @Expose()
  @ApiProperty()
  systemQty!: number;

  @Expose()
  @ApiPropertyOptional()
  actualQty!: number | null;

  @Expose()
  @ApiPropertyOptional()
  delta!: number | null;

  @Expose()
  @ApiPropertyOptional()
  reason!: string | null;
}

export class StockCountResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { warehouseId?: Types.ObjectId } }) =>
    obj.warehouseId?.toString(),
  )
  @ApiProperty()
  warehouseId!: string;

  @Expose()
  @Transform(({ obj }: { obj: { zoneId?: Types.ObjectId | null } }) =>
    obj.zoneId ? obj.zoneId.toString() : null,
  )
  @ApiPropertyOptional()
  zoneId!: string | null;

  @Expose()
  @ApiProperty({ enum: StockCountStatus })
  status!: StockCountStatus;

  @Expose()
  @ApiPropertyOptional()
  note?: string;

  @Expose()
  @Transform(({ obj }: { obj: { createdBy?: Types.ObjectId } }) =>
    obj.createdBy?.toString(),
  )
  @ApiProperty()
  createdBy!: string;

  @Expose()
  @Transform(({ obj }: { obj: { countedBy?: Types.ObjectId } }) =>
    obj.countedBy ? obj.countedBy.toString() : null,
  )
  @ApiPropertyOptional()
  countedBy!: string | null;

  @Expose()
  @Transform(({ obj }: { obj: { approvedBy?: Types.ObjectId } }) =>
    obj.approvedBy ? obj.approvedBy.toString() : null,
  )
  @ApiPropertyOptional()
  approvedBy!: string | null;

  @Expose()
  @ApiPropertyOptional()
  approveReason?: string;

  @Expose()
  @Type(() => StockCountItemResponseDto)
  @ApiProperty({ type: [StockCountItemResponseDto] })
  items!: StockCountItemResponseDto[];

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
