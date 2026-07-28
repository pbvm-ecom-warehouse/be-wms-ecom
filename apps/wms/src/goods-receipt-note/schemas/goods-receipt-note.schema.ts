import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PackageSpec,
  PackageSpecSchema,
} from '../../stock/schemas/package-spec.schema';

export enum GoodsReceiptNoteStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  CONFIRMED = 'CONFIRMED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** Sub-document: 1 dòng hàng thực nhận trong GRN. Không audit riêng — kế thừa từ GRN cha. */
@Schema({ _id: false })
export class GoodsReceiptNoteItem {
  /** WarehouseItem._id — phải có mặt trong PurchaseOrder.items */
  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  /** Denormalized từ WarehouseItem.sku */
  @Prop({ required: true })
  sku!: string;

  /** Copy từ PO item tại thời điểm tạo GRN — chỉ để hiển thị, không dùng để tính lại */
  @Prop({ type: Number, required: true, min: 0 })
  expectedQty!: number;

  /** Số thực nhận, theo đơn vị `unit` (có thể là đơn vị phụ) */
  @Prop({ type: Number, required: true, min: 0 })
  actualQty!: number;

  @Prop({ required: true })
  unit!: string;

  /** Bắt buộc nếu WarehouseItem.isPerishable */
  @Prop()
  lotNumber?: string;

  @Prop({ type: Date })
  expiryDate?: Date;

  /** Ghi chú khi lệch PO (thiếu/thừa) */
  @Prop()
  note?: string;

  /** Snapshot quy cách thùng từ PO/master data tại thời điểm tạo/sửa GRN. */
  @Prop({ type: PackageSpecSchema })
  packageSpec?: PackageSpec;

  /** Số thùng thực nhận; riêng luồng mới chỉ cho cất/xuất nguyên thùng. */
  @Prop({ type: Number, default: 0, min: 0 })
  packageCount!: number;

  @Prop({ default: true })
  wholePackageOnly!: boolean;
}
const GoodsReceiptNoteItemSchema =
  SchemaFactory.createForClass(GoodsReceiptNoteItem);

/**
 * Phiếu nhập kho thực tế (GRN, UC-02). Chứng từ giao dịch — hủy bằng status, KHÔNG soft-delete.
 */
@Schema({ collection: 'goods_receipt_notes', timestamps: true })
export class GoodsReceiptNote {
  @Prop({ required: true, unique: true })
  grnNumber!: string;

  @Prop({ type: Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ enum: GoodsReceiptNoteStatus, default: GoodsReceiptNoteStatus.DRAFT })
  status!: GoodsReceiptNoteStatus;

  @Prop({ type: [GoodsReceiptNoteItemSchema], required: true })
  items!: GoodsReceiptNoteItem[];

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  confirmedBy?: Types.ObjectId;

  @Prop({ type: Date })
  submittedAt?: Date;

  @Prop({ type: Types.ObjectId })
  submittedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: Types.ObjectId })
  rejectedBy?: Types.ObjectId;

  @Prop({ type: Date })
  rejectedAt?: Date;

  @Prop()
  rejectionReason?: string;

  /** Ảnh minh chứng nhập kho (kiện hàng/hàng lỗi lúc nhận) — cấp phiếu, không phải từng dòng. */
  @Prop({ type: [String], default: [] })
  images!: string[];
}

export type GoodsReceiptNoteDocument = HydratedDocument<GoodsReceiptNote>;
export const GoodsReceiptNoteSchema =
  SchemaFactory.createForClass(GoodsReceiptNote);
GoodsReceiptNoteSchema.index({ purchaseOrderId: 1 });
GoodsReceiptNoteSchema.index({ status: 1 });
