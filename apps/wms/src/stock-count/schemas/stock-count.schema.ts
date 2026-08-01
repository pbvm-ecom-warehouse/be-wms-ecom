import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum StockCountStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  APPROVED = 'APPROVED',
  /** Phiếu legacy thiếu cellId được đóng khi nâng cấp exact-cell workflow. */
  CANCELLED = 'CANCELLED',
}

/**
 * Sub-document: 1 dòng cần đếm — 1 (item, shelf, cell, lot) cụ thể tại thời điểm
 * tạo phiếu. Không audit riêng — kế thừa từ StockCount cha.
 */
@Schema({ _id: false })
export class StockCountItem {
  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  /** Denormalized từ WarehouseItem.sku — để hiển thị, không dùng để tính lại */
  @Prop({ required: true })
  sku!: string;

  @Prop({ type: Types.ObjectId, required: true })
  shelfId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  cellId!: Types.ObjectId;

  /** null nếu item không isPerishable */
  @Prop({ type: Types.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  /** Tồn hệ thống (số thùng) — copy từ InventoryStock.quantity lúc tạo phiếu */
  @Prop({
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'systemQty phải là số nguyên',
    },
  })
  systemQty!: number;

  /** null = COUNTER chưa đếm dòng này. Số thùng — luôn là số nguyên khi có giá trị. */
  @Prop({
    type: Number,
    default: null,
    validate: {
      validator: (v: number | null) => v === null || Number.isInteger(v),
      message: 'actualQty phải là số nguyên',
    },
  })
  actualQty!: number | null;

  /** = actualQty - systemQty, tính khi COUNTER nhập. null nếu chưa đếm */
  @Prop({
    type: Number,
    default: null,
    validate: {
      validator: (v: number | null) => v === null || Number.isInteger(v),
      message: 'delta phải là số nguyên',
    },
  })
  delta!: number | null;

  /** Lý do lệch (hư hỏng/mất mát/nhập nhầm...) — COUNTER ghi khi nhập, tuỳ chọn */
  @Prop({ type: String, default: null })
  reason!: string | null;

  /** Ảnh minh chứng lệch tồn — đính cùng lúc nhập actualQty/reason, optional. */
  @Prop({ type: [String], default: [] })
  images!: string[];
}
const StockCountItemSchema = SchemaFactory.createForClass(StockCountItem);

/**
 * Phiếu kiểm kho (UC-06). MANAGER tạo tay (không sinh từ event) — auto-generate
 * dòng từ InventoryStock hiện có trong phạm vi kho/zone. Chứng từ giao dịch —
 * hủy bằng status, KHÔNG soft-delete.
 */
@Schema({ collection: 'stock_counts', timestamps: true })
export class StockCount {
  /** Mã phiếu kiểm nghiệp vụ; sparse để dữ liệu legacy vẫn đọc được. */
  @Prop({ unique: true, sparse: true })
  stockCountNumber?: string;

  /** null = kiểm toàn kho */
  @Prop({ type: Types.ObjectId, default: null })
  zoneId!: Types.ObjectId | null;

  @Prop({ enum: StockCountStatus, default: StockCountStatus.DRAFT })
  status!: StockCountStatus;

  @Prop()
  note?: string;

  /** MANAGER tạo phiếu */
  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  /** COUNTER — set khi nhập dòng đầu tiên */
  @Prop({ type: Types.ObjectId })
  countedBy?: Types.ObjectId;

  /** MANAGER — set khi approve */
  @Prop({ type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  /** Lý do chung ghi lúc duyệt cả phiếu */
  @Prop()
  approveReason?: string;

  @Prop()
  cancelReason?: string;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ type: [StockCountItemSchema], required: true })
  items!: StockCountItem[];
}

export type StockCountDocument = HydratedDocument<StockCount>;
export const StockCountSchema = SchemaFactory.createForClass(StockCount);

StockCountSchema.index({ status: 1 });
