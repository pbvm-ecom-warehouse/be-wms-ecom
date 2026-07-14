import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ScrapNoteStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
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

  /**
   * null nếu item không isPerishable, hoặc perishable nhưng hủy vì lý do khác
   * hết hạn (hỏng/vỡ) mà không cần gắn đúng lô — CÓ giá trị nghĩa là "hủy vì
   * hết hạn" (dùng để quyết định có trừ StockBalance.expired hay không, xem
   * scrap-note.service.ts).
   */
  @Prop({ type: Types.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  @Prop({ type: Number, required: true, min: 0 })
  quantity!: number;

  /** Lý do hủy — hết hạn/vỡ/ẩm mốc/khác, tự do nhập */
  @Prop({ required: true })
  reason!: string;
}
const ScrapNoteItemSchema = SchemaFactory.createForClass(ScrapNoteItem);

/**
 * Phiếu đề xuất hủy hàng hết hạn/hỏng (UC-08). COUNTER/RECEIVER tạo tay, kèm
 * toàn bộ dòng ngay từ đầu — không auto-generate như StockCount. Chứng từ
 * giao dịch — hủy bằng status, KHÔNG soft-delete.
 */
@Schema({ collection: 'scrap_notes', timestamps: true })
export class ScrapNote {
  @Prop({ type: Types.ObjectId, required: true })
  warehouseId!: Types.ObjectId;

  @Prop({ enum: ScrapNoteStatus, default: ScrapNoteStatus.DRAFT })
  status!: ScrapNoteStatus;

  @Prop()
  note?: string;

  /** COUNTER/RECEIVER đề xuất */
  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  /** MANAGER — set khi approve hoặc reject */
  @Prop({ type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  /** Bắt buộc có giá trị khi status = REJECTED */
  @Prop()
  rejectReason?: string;

  @Prop({ type: [ScrapNoteItemSchema], required: true })
  items!: ScrapNoteItem[];
}

export type ScrapNoteDocument = HydratedDocument<ScrapNote>;
export const ScrapNoteSchema = SchemaFactory.createForClass(ScrapNote);

ScrapNoteSchema.index({ warehouseId: 1, status: 1 });
ScrapNoteSchema.index({ status: 1 });
