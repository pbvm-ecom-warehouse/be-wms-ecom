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
import { ItemType } from '../../stock/schemas/warehouse-item.schema';
import { PackageSpecResponseDto } from '../../purchase-order/dto/purchase-order.dto';

export class CreateGoodsReceiptNoteItemDto {
  @ApiProperty({
    description: 'WarehouseItem._id (ObjectId)',
    example: '665f...',
  })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({ example: 100, description: 'Số lượng thực nhận' })
  @IsNumber()
  @Min(0)
  actualQty!: number;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Số thùng nguyên thực nhận; nếu bỏ trống server tính từ actualQty/packageSpec.factor cho chứng từ legacy.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  packageCount?: number;

  @ApiPropertyOptional({
    example: 'cái',
    description:
      'Đơn vị thực nhận — có thể khác unit đặt trong PO (vd PO đặt "thùng" nhưng đếm ra "cái"). ' +
      'Bỏ trống thì lấy theo unit của dòng PO tương ứng.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  unit?: string;

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

  @ApiPropertyOptional({
    type: [CreateGoodsReceiptNoteItemDto],
    description:
      'Bỏ trống để server tự lấy các dòng PO còn thiếu (expectedQty - receivedQty) làm actualQty mặc định. ' +
      'Dòng hàng perishable vẫn cần gửi tay kèm lotNumber/expiryDate vì server không tự đoán được.',
  })
  @IsOptional()
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

  /** Tổng đã nhận của PO tính đến hiện tại (mọi GRN đã CONFIRMED) — không phải riêng GRN này. */
  @Expose()
  @ApiPropertyOptional()
  receivedQty?: number;

  /** = expectedQty - receivedQty tại thời điểm trả response — FE không tự trừ lại. */
  @Expose()
  @ApiPropertyOptional()
  remainingQty?: number;

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

  @Expose()
  @ApiProperty()
  packageCount!: number;

  @Expose()
  @Type(() => PackageSpecResponseDto)
  @ApiPropertyOptional({ type: PackageSpecResponseDto })
  packageSpec?: PackageSpecResponseDto;

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
  @ApiPropertyOptional()
  totalVolumeCm3?: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
