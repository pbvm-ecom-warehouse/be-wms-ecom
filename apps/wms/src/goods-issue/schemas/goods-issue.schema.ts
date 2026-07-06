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
 * Không lưu shippingAddress/recipient/paymentMethod/codAmount — thuộc
 * trách nhiệm module Shipping (đọc lại từ event gốc khi implement).
 */
@Schema({ collection: 'goods_issues', timestamps: true })
export class GoodsIssue {
  /** id đơn hàng bên Ecom — KHÔNG phải ObjectId nội bộ WMS */
  @Prop({ required: true, unique: true })
  orderId!: string;

  @Prop({ type: Types.ObjectId, required: true })
  warehouseId!: Types.ObjectId;

  @Prop({ enum: GoodsIssueStatus, default: GoodsIssueStatus.PENDING })
  status!: GoodsIssueStatus;

  @Prop({ type: [GoodsIssueItemSchema], required: true })
  items!: GoodsIssueItem[];
}

export type GoodsIssueDocument = HydratedDocument<GoodsIssue>;
export const GoodsIssueSchema = SchemaFactory.createForClass(GoodsIssue);

// 1 đơn 1 phiếu xuất — chặn consumer tạo trùng nếu event redeliver
GoodsIssueSchema.index({ orderId: 1 }, { unique: true });
GoodsIssueSchema.index({ status: 1 });
