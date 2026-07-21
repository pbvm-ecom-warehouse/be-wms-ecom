import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum GoodsIssueStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
}

/** Sub-document: 1 dòng cần xuất (map theo sku trong order.ready_to_fulfill). Không audit riêng — kế thừa từ GoodsIssue cha. */
@Schema({ _id: false })
export class GoodsIssueItem {
  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  /** Denormalized từ WarehouseItem.sku — để hiển thị, không dùng để tính lại */
  @Prop({ required: true })
  sku!: string;

  /** Số lượng cần xuất — copy từ payload order.ready_to_fulfill */
  @Prop({ type: Number, required: true, min: 0 })
  quantity!: number;

  /** Còn lại chưa xuất — giảm dần mỗi lần PICKER quét xác nhận thành công */
  @Prop({ type: Number, required: true, min: 0 })
  remainingQty!: number;
}
const GoodsIssueItemSchema = SchemaFactory.createForClass(GoodsIssueItem);

/**
 * Phiếu xuất kho (UC-05). Sinh tự động khi nhận order.ready_to_fulfill.
 * Chứng từ giao dịch — hủy bằng status, KHÔNG soft-delete.
 * Lưu snapshot shippingAddress/recipient/paymentMethod/codAmount từ payload
 * gốc — module Shipping đọc lại qua GoodsIssueRepository.findById để dựng
 * Shipment, không đọc chéo ecom_db.
 */
@Schema({ collection: 'goods_issues', timestamps: true })
export class GoodsIssue {
  /** id đơn hàng bên Ecom — KHÔNG phải ObjectId nội bộ WMS */
  @Prop({ required: true, unique: true })
  orderId!: string;

  @Prop({ type: Types.ObjectId, required: true })
  warehouseId!: Types.ObjectId;

  /** Snapshot địa chỉ giao — từ payload order.ready_to_fulfill, không đổi theo thời gian */
  @Prop({ type: Object, required: true })
  shippingAddress!: Record<string, unknown>;

  /** Snapshot người nhận — dùng để dựng Shipment (module Shipping đọc lại qua goodsIssueId) */
  @Prop({ type: { name: String, phone: String }, required: true })
  recipient!: { name: string; phone: string };

  @Prop({ enum: ['COD', 'ONLINE'], required: true })
  paymentMethod!: 'COD' | 'ONLINE';

  @Prop({ type: Number, default: 0 })
  codAmount!: number;

  @Prop({ enum: GoodsIssueStatus, default: GoodsIssueStatus.PENDING })
  status!: GoodsIssueStatus;

  @Prop({ type: [GoodsIssueItemSchema], required: true })
  items!: GoodsIssueItem[];
}

export type GoodsIssueDocument = HydratedDocument<GoodsIssue>;
export const GoodsIssueSchema = SchemaFactory.createForClass(GoodsIssue);

// unique index cho orderId đã khai báo qua @Prop({ unique: true }) ở trên
GoodsIssueSchema.index({ status: 1 });
