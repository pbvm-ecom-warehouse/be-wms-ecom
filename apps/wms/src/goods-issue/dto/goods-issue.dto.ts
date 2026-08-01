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
import { GoodsIssueStatus } from '../schemas/goods-issue.schema';
import { NavigationPathDto } from '../../put-away-suggestion/dto/put-away-suggestion.dto';

export class AssignGoodsIssueDto {
  @ApiProperty({
    description: 'Nhân viên có role SHIPPER được Admin/Manager gán',
  })
  @IsMongoId()
  shipperId!: string;
}

export class ConfirmGoodsIssueLineDto {
  @ApiProperty({ example: 'CUP-PLA-500-RED', description: 'Barcode quét SKU' })
  @IsString()
  @MinLength(1)
  itemBarcode!: string;

  @ApiPropertyOptional({
    example: 'A1-T1',
    description: 'Legacy barcode shelf',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  shelfCode?: string;

  @ApiPropertyOptional({
    example: 'A1-T1-B1',
    description: 'Barcode khoang lấy hàng',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  cellBarcode?: string;

  @ApiPropertyOptional({
    description: 'Khoang hệ thống đã gợi ý để audit override',
  })
  @IsOptional()
  @IsMongoId()
  suggestedCellId?: string;

  @ApiPropertyOptional({ example: 2, description: 'Số thùng nguyên cần xuất' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

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
  @ApiPropertyOptional()
  packageFactor?: number;

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
  @Transform(({ value }: { value?: string }) => value ?? null)
  @ApiPropertyOptional({
    example: 'GI-20260730-0001',
    nullable: true,
    description: 'Null với chứng từ legacy chưa backfill',
  })
  goodsIssueNumber!: string | null;

  @Expose()
  @ApiProperty()
  orderId!: string;

  @Expose()
  @Transform(({ value }: { value?: string }) => value ?? null)
  @ApiPropertyOptional({
    example: 'ORD-20260730-0001',
    nullable: true,
    description: 'Snapshot mã đơn Ecommerce; null với dữ liệu legacy',
  })
  orderCode!: string | null;

  @Expose()
  @ApiProperty({ enum: GoodsIssueStatus })
  status!: GoodsIssueStatus;

  @Expose()
  @Transform(
    ({ obj }: { obj: { assignedShipperId?: Types.ObjectId | null } }) =>
      obj.assignedShipperId?.toString(),
  )
  @ApiPropertyOptional()
  assignedShipperId?: string;

  @Expose()
  @ApiPropertyOptional()
  assignedAt?: Date;

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
  @Transform(({ obj }: { obj: { cellId?: Types.ObjectId | null } }) =>
    obj.cellId ? obj.cellId.toString() : null,
  )
  @ApiPropertyOptional()
  cellId?: string | null;

  @Expose()
  @ApiProperty({
    description: 'Barcode dán trên kệ — SHIPPER quét/đọc để tìm vị trí',
  })
  shelfCode!: string;

  @Expose()
  @ApiPropertyOptional()
  cellCode?: string | null;

  @Expose()
  @Transform(({ obj }: { obj: { rackId?: Types.ObjectId | null } }) =>
    obj.rackId ? obj.rackId.toString() : null,
  )
  @ApiPropertyOptional()
  rackId?: string | null;

  @Expose()
  @ApiPropertyOptional()
  level?: number;

  @Expose()
  @ApiPropertyOptional()
  bay?: number;

  @Expose()
  @Type(() => NavigationPathDto)
  @ApiPropertyOptional({ type: NavigationPathDto })
  path?: NavigationPathDto;

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

  @Expose()
  @ApiPropertyOptional()
  packageFactor?: number;
}
