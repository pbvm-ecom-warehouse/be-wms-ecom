import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  SENT = 'SENT',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Sub-document: 1 dòng hàng đặt trong PO. Không audit riêng — kế thừa từ PO cha. */
@Schema({ _id: false })
export class PurchaseOrderItem {
  /** WarehouseItem._id */
  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  /** Denormalized từ WarehouseItem.sku — hiển thị nhanh không cần join */
  @Prop({ required: true })
  sku!: string;

  @Prop({ type: Number, required: true, min: 0 })
  expectedQty!: number;

  /** Đơn vị đặt — có thể là đơn vị phụ (vd "thùng") của WarehouseItem */
  @Prop({ required: true })
  unit!: string;

  /** Giá đặt — mặc định gợi ý từ SupplierItem.purchasePrice, sửa tay được */
  @Prop({ type: Number, required: true, min: 0 })
  unitPrice!: number;

  /** Tích lũy từ mọi GRN đã CONFIRMED tham chiếu PO này — đơn vị cơ sở (base unit) */
  @Prop({ type: Number, default: 0, min: 0 })
  receivedQty!: number;
}
const PurchaseOrderItemSchema = SchemaFactory.createForClass(PurchaseOrderItem);

/**
 * Đơn đặt hàng gửi NCC (UC-01). Chứng từ giao dịch — hủy bằng status, KHÔNG soft-delete.
 */
@Schema({ collection: 'purchase_orders', timestamps: true })
export class PurchaseOrder {
  @Prop({ required: true, unique: true })
  poNumber!: string;

  @Prop({ type: Types.ObjectId, required: true })
  supplierId!: Types.ObjectId;

  @Prop({ enum: PurchaseOrderStatus, default: PurchaseOrderStatus.CONFIRMED })
  status!: PurchaseOrderStatus;

  @Prop({ type: Date, default: Date.now })
  orderDate!: Date;

  @Prop({ type: Date })
  expectedDate?: Date;

  @Prop()
  note?: string;

  @Prop({ type: [PurchaseOrderItemSchema], required: true })
  items!: PurchaseOrderItem[];

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;
}

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;
export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
PurchaseOrderSchema.index({ supplierId: 1 });
PurchaseOrderSchema.index({ status: 1 });
