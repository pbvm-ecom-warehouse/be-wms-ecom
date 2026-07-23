import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ShipmentStatus {
  PENDING = 'PENDING',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  RETURNING = 'RETURNING',
  RETURNED = 'RETURNED',
}

/** Append-only log — không sửa/xóa dòng cũ, chỉ thêm mỗi lần đổi trạng thái. */
@Schema({ _id: false })
export class ShipmentStatusHistoryEntry {
  @Prop({ enum: ShipmentStatus, required: true })
  status!: ShipmentStatus;

  @Prop({ type: Date, required: true })
  at!: Date;

  @Prop({ type: Types.ObjectId })
  by?: Types.ObjectId;

  @Prop()
  note?: string;

  /** Ảnh bằng chứng giao hàng (POD) — chỉ có ý nghĩa ở dòng status=DELIVERED, optional. */
  @Prop({ type: [String], default: [] })
  images!: string[];
}
const ShipmentStatusHistoryEntrySchema = SchemaFactory.createForClass(
  ShipmentStatusHistoryEntry,
);

/**
 * Vận đơn (UC-S02..S05) — 1:1 với GoodsIssue, auto-sinh khi nhận goods.issued.
 * Chứng từ giao dịch: hủy bằng shipmentStatus, KHÔNG soft-delete.
 */
@Schema({ collection: 'shipments', timestamps: true })
export class Shipment {
  /** id tham chiếu đơn Ecom — KHÔNG đọc chéo ecom_db, chỉ lưu để đối soát & đẩy event */
  @Prop({ required: true })
  orderId!: string;

  @Prop({ type: Types.ObjectId, required: true })
  goodsIssueId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  fulfillWarehouseId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  carrierId?: Types.ObjectId;

  @Prop()
  trackingNumber?: string;

  @Prop({ enum: ShipmentStatus, default: ShipmentStatus.PENDING })
  shipmentStatus!: ShipmentStatus;

  /** Snapshot từ GoodsIssue lúc auto-sinh — WMS không đọc lại ecom_db sau đó */
  @Prop({
    type: { name: String, phone: String, address: Object },
    required: true,
  })
  recipient!: { name: string; phone: string; address: Record<string, unknown> };

  @Prop({ enum: ['COD', 'ONLINE'], required: true })
  paymentMethod!: 'COD' | 'ONLINE';

  @Prop({ type: Number, default: 0 })
  codAmount!: number;

  @Prop({ type: Number, default: 0 })
  attempts!: number;

  @Prop()
  failReason?: string;

  @Prop({ type: [ShipmentStatusHistoryEntrySchema], default: [] })
  statusHistory!: ShipmentStatusHistoryEntry[];

  @Prop({ type: Date })
  shippedAt?: Date;

  @Prop({ type: Date })
  deliveredAt?: Date;
}

export type ShipmentDocument = HydratedDocument<Shipment>;
export const ShipmentSchema = SchemaFactory.createForClass(Shipment);

// 1 GoodsIssue = 1 Shipment — chặn tạo trùng nếu goods.issued redeliver
ShipmentSchema.index({ goodsIssueId: 1 }, { unique: true });
ShipmentSchema.index({ orderId: 1 });
ShipmentSchema.index({ shipmentStatus: 1 });
ShipmentSchema.index({ carrierId: 1 });
