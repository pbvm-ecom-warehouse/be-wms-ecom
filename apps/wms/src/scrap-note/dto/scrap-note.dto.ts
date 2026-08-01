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
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';
import { ScrapNoteStatus } from '../schemas/scrap-note.schema';

export class CreateStockCountScrapFormDto {
  @ApiProperty({ description: 'Barcode của đúng SKU trên dòng kiểm kê' })
  @IsString()
  @MinLength(1)
  itemBarcode!: string;

  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1c' })
  @IsMongoId()
  shelfId!: string;

  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1d' })
  @IsMongoId()
  cellId!: string;

  @ApiPropertyOptional({ example: '665f1a2b3c4d5e6f7a8b9c1b' })
  @IsOptional()
  @IsMongoId()
  lotId?: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 'Hai thùng bị vỡ khi kiểm kê' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class MoveScrapItemDto {
  @ApiProperty({ description: 'Barcode của đúng mặt hàng cần chuyển' })
  @IsString()
  @MinLength(1)
  itemBarcode!: string;

  @ApiProperty({ description: 'Barcode khoang nguồn đang bị khóa' })
  @IsString()
  @MinLength(1)
  sourceCellBarcode!: string;

  @ApiProperty({ description: 'Barcode khoang đích thuộc khu hủy' })
  @IsString()
  @MinLength(1)
  targetCellBarcode!: string;
}

export class RejectScrapNoteDto {
  @ApiProperty({ example: 'Số lượng đề xuất không khớp kiểm tra thực tế' })
  @IsString()
  @MinLength(1)
  rejectReason!: string;
}

export class QueryScrapNoteDto {
  @ApiPropertyOptional({ enum: ScrapNoteStatus })
  @IsOptional()
  @IsEnum(ScrapNoteStatus)
  status?: ScrapNoteStatus;

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

export class ScrapNoteItemResponseDto {
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
  @Transform(({ obj }: { obj: { sourceCellId?: Types.ObjectId | null } }) =>
    obj.sourceCellId ? obj.sourceCellId.toString() : null,
  )
  @ApiPropertyOptional()
  sourceCellId!: string | null;

  @Expose()
  @ApiProperty()
  lockedQuantity!: number;

  @Expose()
  @Transform(({ obj }: { obj: { scrapCellId?: Types.ObjectId | null } }) =>
    obj.scrapCellId ? obj.scrapCellId.toString() : null,
  )
  @ApiPropertyOptional()
  scrapCellId!: string | null;

  @Expose()
  @Transform(({ obj }: { obj: { lotId?: Types.ObjectId | null } }) =>
    obj.lotId ? obj.lotId.toString() : null,
  )
  @ApiPropertyOptional()
  lotId!: string | null;

  @Expose()
  @ApiProperty()
  quantity!: number;

  @Expose()
  @ApiProperty()
  reason!: string;

  @Expose()
  @ApiProperty({ type: [String] })
  images!: string[];
}

export class ScrapNoteResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ value }: { value?: string }) => value ?? null)
  @ApiProperty({
    example: 'SCR-20260730-0001',
    nullable: true,
    description: 'Null với chứng từ legacy chưa backfill',
  })
  scrapNoteNumber!: string | null;

  @Expose()
  @Transform(
    ({ obj }: { obj: { sourceStockCountId?: Types.ObjectId | null } }) =>
      obj.sourceStockCountId ? obj.sourceStockCountId.toString() : null,
  )
  @ApiPropertyOptional({
    nullable: true,
    description: 'Phiếu kiểm kê nguồn; null với phiếu hủy nội bộ khác',
  })
  sourceStockCountId!: string | null;

  @Expose()
  @ApiProperty({ enum: ScrapNoteStatus })
  status!: ScrapNoteStatus;

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
  @Transform(({ obj }: { obj: { approvedBy?: Types.ObjectId } }) =>
    obj.approvedBy ? obj.approvedBy.toString() : null,
  )
  @ApiPropertyOptional()
  approvedBy!: string | null;

  @Expose()
  @ApiPropertyOptional()
  rejectReason?: string;

  @Expose()
  @Transform(({ obj }: { obj: { disposedBy?: Types.ObjectId | null } }) =>
    obj.disposedBy ? obj.disposedBy.toString() : null,
  )
  @ApiPropertyOptional()
  disposedBy?: string | null;

  @Expose()
  @ApiPropertyOptional()
  disposedAt?: Date;

  @Expose()
  @Type(() => ScrapNoteItemResponseDto)
  @ApiProperty({ type: [ScrapNoteItemResponseDto] })
  items!: ScrapNoteItemResponseDto[];

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
