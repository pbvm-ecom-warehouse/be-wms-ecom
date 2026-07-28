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

  @ApiPropertyOptional({ example: 'A1-T1', description: 'Legacy barcode shelf' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  shelfCode?: string;

  @ApiPropertyOptional({ example: 'A1-T1-B1', description: 'Barcode khoang quét tại vị trí cất' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  cellBarcode?: string;

  @ApiPropertyOptional({ description: 'Khoang hệ thống đã gợi ý để audit override' })
  @IsOptional()
  @IsMongoId()
  suggestedCellId?: string;

  @ApiPropertyOptional({ example: 20, description: 'Legacy số lượng base unit' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 2, description: 'Số thùng nguyên cần cất' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  packageCount?: number;

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

export class PutAwayPackageSpecResponseDto {
  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @ApiProperty()
  factor!: number;

  @Expose()
  @ApiProperty()
  depthCm!: number;

  @Expose()
  @ApiProperty()
  widthCm!: number;

  @Expose()
  @ApiProperty()
  heightCm!: number;

  @Expose()
  @ApiProperty()
  volumeCm3!: number;
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

  @Expose()
  @ApiProperty()
  packageCount!: number;

  @Expose()
  @ApiProperty()
  remainingPackageCount!: number;

  @Expose()
  @Type(() => PutAwayPackageSpecResponseDto)
  @ApiPropertyOptional({ type: PutAwayPackageSpecResponseDto })
  packageSpec?: PutAwayPackageSpecResponseDto;
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
