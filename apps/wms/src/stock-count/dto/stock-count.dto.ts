import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Types } from 'mongoose';
import { StockCountStatus } from '../schemas/stock-count.schema';

export class CreateStockCountDto {
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

  @ApiProperty({
    example: 45,
    description: 'Số thùng đếm được thực tế — luôn là số nguyên.',
  })
  @IsInt()
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

/**
 * Request DTO cho POST :id/items/:itemId/count dạng multipart/form-data — cần
 * multipart vì dòng lệch tồn (delta !== 0) có thể kèm ảnh minh chứng (field
 * `images`, xem controller). Multipart form field luôn là string nên
 * `actualQty` cần @Type(() => Number) để coerce trước khi validate.
 */
export class CountStockCountItemFormDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1a' })
  @IsMongoId()
  shelfId!: string;

  @ApiPropertyOptional({ example: '665f1a2b3c4d5e6f7a8b9c1b' })
  @IsOptional()
  @IsMongoId()
  lotId?: string;

  @ApiProperty({
    example: 45,
    description: 'Số thùng đếm được thực tế — luôn là số nguyên.',
  })
  @Type(() => Number)
  @IsInt()
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

  @Expose()
  @ApiProperty({ type: [String] })
  images!: string[];
}

export class StockCountResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ value }: { value?: string }) => value ?? null)
  @ApiProperty({
    example: 'SC-20260730-0001',
    nullable: true,
    description: 'Null với chứng từ legacy chưa backfill',
  })
  stockCountNumber!: string | null;

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
