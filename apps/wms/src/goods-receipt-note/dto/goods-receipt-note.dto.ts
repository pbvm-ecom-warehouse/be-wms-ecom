import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';
import { GoodsReceiptNoteStatus } from '../schemas/goods-receipt-note.schema';
import { ItemType } from '../../stock/schemas/warehouse-item.schema';

function parseJsonArrayIfString({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export class CreateGoodsReceiptNoteItemDto {
  @ApiProperty({
    description: 'WarehouseItem._id (ObjectId)',
    example: '665f...',
  })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({
    example: 5,
    description:
      'Số thùng thực nhận — luôn là số nguyên, theo đơn vị cơ sở (thùng).',
  })
  @IsInt()
  @Min(0)
  actualQty!: number;

  @ApiPropertyOptional({
    example: 'L240601',
    description: 'Bắt buộc nếu WarehouseItem.isPerishable',
  })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiProperty({
    example: '2026-07-28',
    description: 'Ngày sản xuất của lô, bắt buộc với mọi dòng hàng',
  })
  @IsDateString()
  manufacturedDate!: string;

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

  @ApiPropertyOptional({
    type: [CreateGoodsReceiptNoteItemDto],
    description:
      'Bỏ trống để server tự lấy các dòng PO còn thiếu (expectedQty - receivedQty) làm actualQty mặc định. ' +
      'Dòng hàng perishable vẫn cần gửi tay kèm lotNumber/expiryDate vì server không tự đoán được.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const parsed = parseJsonArrayIfString({ value });
    return Array.isArray(parsed)
      ? parsed.map((item) =>
          plainToInstance(CreateGoodsReceiptNoteItemDto, item),
        )
      : parsed;
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptNoteItemDto)
  items?: CreateGoodsReceiptNoteItemDto[];
}

/** Sửa items của GRN còn DRAFT — thay thế toàn bộ, không merge. Bắt buộc gửi đủ
 * (khác lúc tạo, "để trống = nhận đủ theo PO" không áp dụng khi sửa). */
export class UpdateGoodsReceiptNoteItemsDto {
  @ApiProperty({ type: [CreateGoodsReceiptNoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptNoteItemDto)
  items!: CreateGoodsReceiptNoteItemDto[];
}

export class SubmitGoodsReceiptNoteDto {
  @ApiPropertyOptional({ example: 'Gửi duyệt sau khi bổ sung ảnh kiện hàng' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectGoodsReceiptNoteDto {
  @ApiProperty({ example: 'Ảnh kiện hàng chưa rõ hoặc số thùng lệch PO' })
  @IsString()
  @MinLength(1)
  reason!: string;
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

  /** Denormalize từ WarehouseItem tại thời điểm build response — không lưu trong GRN item. */
  @Expose()
  @ApiPropertyOptional()
  itemName?: string;

  @Expose()
  @ApiPropertyOptional()
  barcode?: string;

  @Expose()
  @ApiPropertyOptional()
  category?: string;

  @Expose()
  @ApiPropertyOptional({ enum: ItemType })
  type?: ItemType;

  @Expose()
  @ApiPropertyOptional({ type: [String] })
  images?: string[];

  @Expose()
  @ApiPropertyOptional()
  isPerishable?: boolean;

  @Expose()
  @ApiProperty()
  expectedQty!: number;

  /** Denormalize từ PurchaseOrderItem.unitPrice tại thời điểm build response. */
  @Expose()
  @ApiPropertyOptional()
  unitPrice?: number;

  /** Tổng đã nhận của PO tính đến hiện tại (mọi GRN đã APPROVED) — không phải riêng GRN này. */
  @Expose()
  @ApiPropertyOptional()
  receivedQty?: number;

  /** = expectedQty - receivedQty tại thời điểm trả response — FE không tự trừ lại. */
  @Expose()
  @ApiPropertyOptional()
  remainingQty?: number;

  /** Số thùng thực nhận — luôn là số nguyên, luôn theo đơn vị cơ sở (thùng) của item. */
  @Expose()
  @ApiProperty()
  actualQty!: number;

  @Expose()
  @ApiPropertyOptional()
  lotNumber?: string;

  @Expose()
  @ApiProperty()
  manufacturedDate!: Date;

  @Expose()
  @ApiPropertyOptional()
  expiryDate?: Date;

  @Expose()
  @ApiPropertyOptional()
  note?: string;

  /** Kích thước 1 thùng — đọc "live" từ WarehouseItem tại thời điểm trả response (không snapshot). */
  @Expose()
  @ApiPropertyOptional({ description: 'Chiều sâu (cm) — từ WarehouseItem' })
  itemDepth?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Chiều rộng (cm) — từ WarehouseItem' })
  itemWidth?: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Chiều cao (cm) — từ WarehouseItem' })
  itemHeight?: number;

  @Expose()
  @ApiProperty()
  wholePackageOnly!: boolean;
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

  /** Gắn ở service (tra PurchaseOrder theo purchaseOrderId) — tránh FE phải tự join. */
  @Expose()
  @ApiPropertyOptional()
  purchaseOrderNumber?: string;

  /** Gắn ở service (tra Supplier qua PurchaseOrder.supplierId) — không populate xuyên collection. */
  @Expose()
  @ApiPropertyOptional()
  supplierName?: string;

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
  @ApiPropertyOptional()
  submittedAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  approvedAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  rejectedAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  rejectionReason?: string;

  @Expose()
  @ApiPropertyOptional()
  totalPackageCount?: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
