import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
import { ScrapNoteStatus } from '../schemas/scrap-note.schema';

export class CreateScrapNoteItemDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1a' })
  @IsMongoId()
  itemId!: string;

  @ApiPropertyOptional({
    example: '665f1a2b3c4d5e6f7a8b9c1b',
    description:
      'Bắt buộc nếu item isPerishable. Có giá trị = hủy vì hết hạn (trừ cả expired); không có = hủy vì hỏng/vỡ (chỉ trừ onHand, có sync Ecom)',
  })
  @IsOptional()
  @IsMongoId()
  lotId?: string;

  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c1c' })
  @IsMongoId()
  shelfId!: string;

  @ApiProperty({ example: 10, description: 'Số lượng đề xuất hủy' })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 'Vỡ trong lúc vận chuyển nội bộ' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class CreateScrapNoteDto {
  @ApiPropertyOptional({ example: 'Kiểm tra định kỳ phát hiện hàng hỏng' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [CreateScrapNoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateScrapNoteItemDto)
  items!: CreateScrapNoteItemDto[];
}

/**
 * Request DTO cho POST /scrap-notes dạng multipart/form-data — cần multipart vì
 * mỗi dòng đề xuất hủy có thể kèm ảnh minh chứng (field file riêng theo index,
 * xem controller). `items` gửi dưới dạng JSON string (form field thường), parse
 * + validate thủ công bằng CreateScrapNoteDto thay vì để ValidationPipe global
 * làm (pipe không parse JSON lồng trong multipart form field).
 */
export class CreateScrapNoteFormDto {
  @ApiPropertyOptional({ example: 'Kiểm tra định kỳ phát hiện hàng hỏng' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    description: 'JSON string của mảng CreateScrapNoteItemDto',
    example:
      '[{"itemId":"665f...","shelfId":"665f...","quantity":5,"reason":"Vỡ"}]',
  })
  @IsString()
  items!: string;
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
