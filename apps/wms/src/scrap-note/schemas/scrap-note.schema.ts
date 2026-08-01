import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ScrapNoteStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  QUARANTINED = 'QUARANTINED',
  DISPOSED = 'DISPOSED',
  REJECTED = 'REJECTED',
}

/**
 * Sub-document: 1 dòng đề xuất hủy — 1 (item, shelf, lot) cụ thể. Không audit
 * riêng — kế thừa từ ScrapNote cha.
 */
@Schema({ _id: false })
export class ScrapNoteItem {
  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  /** Denormalized từ WarehouseItem.sku — để hiển thị, không dùng để tính lại */
  @Prop({ required: true })
  sku!: string;

  @Prop({ type: Types.ObjectId, required: true })
  shelfId!: Types.ObjectId;

  /** Khoang nguồn bị khóa toàn dòng khi COUNTER đề xuất từ kiểm kê. */
  @Prop({ type: Types.ObjectId, default: null })
  sourceCellId!: Types.ObjectId | null;

  /** Số lượng toàn dòng đã khóa, có thể lớn hơn quantity đề xuất hủy. */
  @Prop({ type: Number, default: 0 })
  lockedQuantity!: number;

  /** Khoang thuộc zone SCRAP sau khi COUNTER quét chuyển hàng. */
  @Prop({ type: Types.ObjectId, default: null })
  scrapCellId!: Types.ObjectId | null;

  /** true nếu dòng đã nằm trong bucket expired trước khi bị khóa. */
  @Prop({ type: Boolean, default: false })
  excludedByExpired!: boolean;

  /** Lô vật lý của đúng dòng tồn cần chuyển/hủy; null với hàng không theo lô. */
  @Prop({ type: Types.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  @Prop({
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'quantity phải là số nguyên',
    },
  })
  quantity!: number;

  /** Lý do hủy — hết hạn/vỡ/ẩm mốc/khác, tự do nhập */
  @Prop({ required: true })
  reason!: string;

  /** Ảnh minh chứng hàng hủy — đính lúc tạo phiếu, optional. */
  @Prop({ type: [String], default: [] })
  images!: string[];
}
const ScrapNoteItemSchema = SchemaFactory.createForClass(ScrapNoteItem);

/**
 * Phiếu đề xuất hủy hàng hết hạn/hỏng. COUNTER tạo từ đúng dòng Stock Count;
 * hàng hoàn DAMAGED tạo phiếu APPROVED tự động. Chứng từ giao dịch chỉ đổi
 * trạng thái, không soft-delete.
 */
@Schema({ collection: 'scrap_notes', timestamps: true })
export class ScrapNote {
  /** Mã phiếu hủy nghiệp vụ; sparse để dữ liệu legacy vẫn đọc được. */
  @Prop({ unique: true, sparse: true })
  scrapNoteNumber?: string;

  /**
   * Có giá trị khi COUNTER đề xuất hủy từ một dòng kiểm kê. Unique + sparse
   * bảo đảm mỗi Stock Count chỉ gom vào đúng một phiếu hủy DRAFT.
   */
  @Prop({ type: Types.ObjectId })
  sourceStockCountId?: Types.ObjectId;

  @Prop({ enum: ScrapNoteStatus, default: ScrapNoteStatus.DRAFT })
  status!: ScrapNoteStatus;

  @Prop()
  note?: string;

  /** COUNTER đề xuất hoặc RECEIVER xác nhận hàng hoàn DAMAGED */
  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  /** MANAGER — set khi approve hoặc reject */
  @Prop({ type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  /** Bắt buộc có giá trị khi status = REJECTED */
  @Prop()
  rejectReason?: string;

  @Prop({ type: Types.ObjectId })
  disposedBy?: Types.ObjectId;

  @Prop({ type: Date })
  disposedAt?: Date;

  @Prop({ type: [ScrapNoteItemSchema], required: true })
  items!: ScrapNoteItem[];
}

export type ScrapNoteDocument = HydratedDocument<ScrapNote>;
export const ScrapNoteSchema = SchemaFactory.createForClass(ScrapNote);

ScrapNoteSchema.index({ status: 1 });
ScrapNoteSchema.index(
  { sourceStockCountId: 1 },
  { unique: true, sparse: true },
);
