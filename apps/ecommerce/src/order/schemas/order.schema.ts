import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum PaymentMethod {
  COD = 'COD',
  ONLINE = 'ONLINE',
}

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  REFUND_PENDING = 'REFUND_PENDING',
  REFUNDED = 'REFUNDED',
}

export enum OrderStatus {
  PLACED = 'PLACED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  CLOSED = 'CLOSED',
}

export enum FulfillmentStatus {
  NONE = 'NONE',
  AWAITING_PRINT = 'AWAITING_PRINT',
  READY_TO_PICK = 'READY_TO_PICK',
  ISSUED = 'ISSUED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
}

export class OrderItem {
  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  name: string; // snapshot tại thời điểm đặt

  @Prop({ required: true, min: 0 })
  unitPrice: number; // snapshot giá lúc đặt

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ default: false })
  isPrintItem: boolean;

  @Prop({ default: null })
  designFile?: string; // snapshot URL thiết kế

  @Prop({ default: null })
  designId?: string; // ID thiết kế gốc

  @Prop({ default: null })
  printJobId?: string; // mã lệnh in WMS gán sau
}

export class ShippingAddress {
  @Prop({ required: true })
  recipientName: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  line: string;

  @Prop({ required: true })
  ward: string;

  @Prop({ required: true })
  district: string;

  @Prop({ required: true })
  province: string;
}

@Schema({ collection: 'orders', timestamps: true })
export class Order {
  @Prop({ required: true, unique: true, index: true })
  code: string; // ví dụ: ORD-YYYYMMDD-001

  @Prop({ required: true, type: Types.ObjectId, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: [Object], required: true })
  items: OrderItem[];

  @Prop({ type: Object, required: true })
  shippingAddress: ShippingAddress;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ default: 0 })
  shippingFee: number;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ enum: PaymentMethod, required: true })
  paymentMethod: PaymentMethod;

  @Prop({ enum: PaymentStatus, default: PaymentStatus.UNPAID, index: true })
  paymentStatus: PaymentStatus;

  @Prop({ enum: OrderStatus, default: OrderStatus.PLACED, index: true })
  orderStatus: OrderStatus;

  @Prop({
    enum: FulfillmentStatus,
    default: FulfillmentStatus.NONE,
    index: true,
  })
  fulfillmentStatus: FulfillmentStatus;

  /** WMS kho đã giữ tồn */
  @Prop({ type: String, default: null })
  fulfillWarehouseId: string | null;

  @Prop({ default: false })
  hasPrintItems: boolean;

  /** Đơn ONLINE: hạn hoàn tất trả tiền */
  @Prop({ type: Date, default: null })
  paymentDeadline: Date | null;

  @Prop({ type: String, default: null })
  cancelReason: string | null;

  @Prop({ type: Date, default: null })
  placedAt: Date | null;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);

// Index phục vụ tra cứu lịch sử mua hàng hiệu quả
OrderSchema.index({ customerId: 1, orderStatus: 1 });
OrderSchema.index({ customerId: 1, createdAt: -1 });
