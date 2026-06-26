import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { PaymentMethod, PaymentStatus, OrderStatus, FulfillmentStatus } from '../schemas/order.schema';

export class CancelOrderDto {
  @ApiPropertyOptional({ example: 'Đặt nhầm sản phẩm' })
  @IsString() @IsOptional()
  reason?: string;
}

export class OrderItemResponseDto {
  @Expose()
  @ApiProperty({ example: 'CUP-PP-350ML' })
  sku!: string;

  @Expose()
  @ApiProperty({ example: 'Ly nhựa PP 350ml' })
  name!: string;

  @Expose()
  @ApiProperty({ example: 1200 })
  unitPrice!: number;

  @Expose()
  @ApiProperty({ example: 10 })
  quantity!: number;

  @Expose()
  @ApiProperty({ example: false })
  isPrintItem!: boolean;

  @Expose()
  @ApiProperty({ example: null, nullable: true })
  designFile!: string | null;

  @Expose()
  @ApiProperty({ example: null, nullable: true })
  designId!: string | null;

  @Expose()
  @ApiProperty({ example: null, nullable: true })
  printJobId!: string | null;
}

export class ShippingAddressResponseDto {
  @Expose()
  @ApiProperty({ example: 'Nguyễn Văn A' })
  recipientName!: string;

  @Expose()
  @ApiProperty({ example: '0901234567' })
  phone!: string;

  @Expose()
  @ApiProperty({ example: '123 Đường ABC' })
  line!: string;

  @Expose()
  @ApiProperty({ example: 'Phường 1' })
  ward!: string;

  @Expose()
  @ApiProperty({ example: 'Quận 1' })
  district!: string;

  @Expose()
  @ApiProperty({ example: 'Thành phố Hồ Chí Minh' })
  province!: string;
}

export class OrderResponseDto {
  @Expose()
  @ApiProperty({ example: '64abc123e4b0...' })
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) => obj._id?.toString())
  id!: string;

  @Expose()
  @ApiProperty({ example: 'ORD-20260626-001' })
  code!: string;

  @Expose()
  @ApiProperty({ example: '64def456e4b0...' })
  @Transform(({ obj }: { obj: { customerId?: Types.ObjectId } }) => obj.customerId?.toString())
  customerId!: string;

  @Expose()
  @ApiProperty({ type: [OrderItemResponseDto] })
  @Type(() => OrderItemResponseDto)
  items!: OrderItemResponseDto[];

  @Expose()
  @ApiProperty({ type: ShippingAddressResponseDto })
  @Type(() => ShippingAddressResponseDto)
  shippingAddress!: ShippingAddressResponseDto;

  @Expose()
  @ApiProperty({ example: 12000 })
  subtotal!: number;

  @Expose()
  @ApiProperty({ example: 0 })
  shippingFee!: number;

  @Expose()
  @ApiProperty({ example: 12000 })
  total!: number;

  @Expose()
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.COD })
  paymentMethod!: PaymentMethod;

  @Expose()
  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.UNPAID })
  paymentStatus!: PaymentStatus;

  @Expose()
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PLACED })
  orderStatus!: OrderStatus;

  @Expose()
  @ApiProperty({ enum: FulfillmentStatus, example: FulfillmentStatus.NONE })
  fulfillmentStatus!: FulfillmentStatus;

  @Expose()
  @ApiProperty({ example: null, nullable: true })
  fulfillWarehouseId!: string | null;

  @Expose()
  @ApiProperty({ example: false })
  hasPrintItems!: boolean;

  @Expose()
  @ApiProperty({ example: null, nullable: true })
  paymentDeadline!: Date | null;

  @Expose()
  @ApiProperty({ example: null, nullable: true })
  cancelReason!: string | null;

  @Expose()
  @ApiProperty({ example: '2026-06-26T04:30:00.000Z' })
  placedAt!: Date | null;
}

export class SuccessResponseDto {
  @Expose()
  @ApiProperty({ example: 'Thao tác thành công' })
  message!: string;
}
