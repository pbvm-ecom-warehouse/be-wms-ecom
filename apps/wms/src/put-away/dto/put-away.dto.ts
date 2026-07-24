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
import { PutAwayTaskStatus } from '../schemas/put-away-task.schema';

export class ConfirmPutAwayLineDto {
  @ApiProperty({ example: 'CUP-PLA-500-RED', description: 'Barcode quét SKU' })
  @IsString()
  @MinLength(1)
  itemBarcode!: string;

  @ApiProperty({ example: 'A1-2', description: 'Barcode quét vị trí shelf' })
  @IsString()
  @MinLength(1)
  shelfCode!: string;

  @ApiProperty({ example: 20, description: 'Số lượng xếp vào shelf này' })
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

export class QueryPutAwayTaskDto {
  @ApiPropertyOptional({ enum: PutAwayTaskStatus })
  @IsOptional()
  @IsEnum(PutAwayTaskStatus)
  status?: PutAwayTaskStatus;

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

export class PutAwayItemResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { itemId?: Types.ObjectId } }) =>
    obj.itemId?.toString(),
  )
  @ApiProperty()
  itemId!: string;

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
  remainingQty!: number;
}

export class PutAwayTaskResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { grnId?: Types.ObjectId } }) =>
    obj.grnId?.toString(),
  )
  @ApiProperty()
  grnId!: string;

  @Expose()
  @ApiProperty({ enum: PutAwayTaskStatus })
  status!: PutAwayTaskStatus;

  @Expose()
  @Type(() => PutAwayItemResponseDto)
  @ApiProperty({ type: [PutAwayItemResponseDto] })
  items!: PutAwayItemResponseDto[];

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
