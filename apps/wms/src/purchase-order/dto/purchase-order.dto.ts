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
import { PurchaseOrderStatus } from '../schemas/purchase-order.schema';

export class CreatePurchaseOrderItemDto {
  @ApiProperty({
    description: 'WarehouseItem._id (ObjectId)',
    example: '665f...',
  })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({
    example: 100,
    description:
      'Nếu SKU đã có SupplierItem.minOrderQty với NCC này, expectedQty phải >= minOrderQty, nếu không PO bị từ chối (PO_QTY_BELOW_MOQ).',
  })
  @IsNumber()
  @Min(0)
  expectedQty!: number;

  @ApiProperty({ example: 'cái' })
  @IsString()
  @MinLength(1)
  unit!: string;

  @ApiPropertyOptional({
    example: 15000,
    description:
      'Để trống → tự điền từ SupplierItem.purchasePrice. Nhập tay vẫn được chấp nhận (giá thương lượng theo đơn); nếu lệch quá 20% so với báo giá đã đăng ký, hệ thống chỉ ghi log cảnh báo, không chặn.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'Supplier._id (ObjectId)', example: '665f...' })
  @IsMongoId()
  supplierId!: string;

  @ApiPropertyOptional({
    description:
      'Ngày dự kiến nhận hàng. Để trống → tự tính = hôm nay + leadTimeDays lớn nhất trong các SupplierItem của đơn (nếu có khai báo).',
  })
  @IsOptional()
  @IsString()
  expectedDate?: string;

  @ApiPropertyOptional({ example: 'Đặt gấp cho đợt khuyến mãi' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items!: CreatePurchaseOrderItemDto[];
}

export class QueryReceivingPurchaseOrderDto {
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

export class QueryPurchaseOrderDto {
  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional({ description: 'Lọc theo NCC' })
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

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

export class PurchaseOrderItemResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { itemId?: Types.ObjectId } }) =>
    obj.itemId?.toString(),
  )
  @ApiProperty()
  itemId!: string;

  @Expose()
  @ApiProperty()
  sku!: string;

  /** Denormalize từ WarehouseItem.name tại thời điểm build response — không lưu trong PurchaseOrderItem schema. */
  @Expose()
  @ApiPropertyOptional()
  itemName?: string;

  @Expose()
  @ApiProperty()
  expectedQty!: number;

  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @ApiProperty()
  unitPrice!: number;
}

/** Thông tin NCC rút gọn gắn vào PO response — không lộ contactName/phone/email/address/taxCode. */
export class SupplierSummaryResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  status!: string;
}

export class PurchaseOrderResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  poNumber!: string;

  @Expose()
  @Transform(({ obj }: { obj: { supplierId?: Types.ObjectId } }) =>
    obj.supplierId?.toString(),
  )
  @ApiProperty()
  supplierId!: string;

  /** Gắn ở service (tra Supplier theo supplierId) — không dùng Mongoose populate (rule data-and-mongoose.md). */
  @Expose()
  @Type(() => SupplierSummaryResponseDto)
  @ApiPropertyOptional({ type: SupplierSummaryResponseDto })
  supplier?: SupplierSummaryResponseDto;

  @Expose()
  @ApiProperty({ enum: PurchaseOrderStatus })
  status!: PurchaseOrderStatus;

  @Expose()
  @ApiProperty()
  orderDate!: Date;

  @Expose()
  @ApiPropertyOptional()
  expectedDate?: Date;

  @Expose()
  @ApiPropertyOptional()
  note?: string;

  @Expose()
  @Type(() => PurchaseOrderItemResponseDto)
  @ApiProperty({ type: [PurchaseOrderItemResponseDto] })
  items!: PurchaseOrderItemResponseDto[];

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}

/** 1 dòng hàng của PO ở màn hình RECEIVER chọn đơn để nhận — đã tính sẵn remainingQty. */
export class ReceivingPurchaseOrderItemResponseDto {
  @Expose()
  @ApiProperty()
  itemId!: string;

  @Expose()
  @ApiProperty()
  itemName!: string;

  @Expose()
  @ApiProperty()
  sku!: string;

  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @ApiProperty()
  expectedQty!: number;

  @Expose()
  @ApiProperty()
  receivedQty!: number;

  /** = expectedQty - receivedQty, tính ở service — FE không tự trừ lại. */
  @Expose()
  @ApiProperty()
  remainingQty!: number;
}

/**
 * PO còn receivable (chưa CANCELLED/COMPLETED), chỉ trả các dòng còn remainingQty > 0 —
 * dùng cho RECEIVER chọn đơn để tạo GRN. Không lộ unitPrice (không cần cho nghiệp vụ nhận hàng).
 */
export class ReceivingPurchaseOrderResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  poNumber!: string;

  @Expose()
  @ApiProperty()
  supplierName!: string;

  @Expose()
  @ApiPropertyOptional()
  expectedDate?: Date;

  @Expose()
  @Type(() => ReceivingPurchaseOrderItemResponseDto)
  @ApiProperty({ type: [ReceivingPurchaseOrderItemResponseDto] })
  items!: ReceivingPurchaseOrderItemResponseDto[];
}
