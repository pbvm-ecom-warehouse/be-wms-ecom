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

  /**
   * true khi ScrapNote này được GoodsReturnService tạo tự động cho dòng
   * DAMAGED (UC-09) — hàng đó vừa được nhập TẠM vào InventoryStock/onHand
   * trong CÙNG bước confirm() rồi hủy ngay, nên chưa từng cộng vào
   * `available`. Nếu approveScrapNote() vẫn bắn stock.changed(-) như bình
   * thường thì available sẽ bị trừ nhầm (available vốn chưa từng tăng cho
   * phần này). Mặc định false — dòng Scrap tạo tay qua POST /scrap-notes
   * (UC-08 gốc) không bao giờ set cờ này.
   */
  @Prop({ default: false })
  skipAvailableSync!: boolean;
}
const ScrapNoteItemSchema = SchemaFactory.createForClass(ScrapNoteItem);

/**
 * Phiếu đề xuất hủy hàng hết hạn/hỏng (UC-08). COUNTER/RECEIVER tạo tay, kèm
 * toàn bộ dòng ngay từ đầu — không auto-generate như StockCount. Chứng từ
 * giao dịch — hủy bằng status, KHÔNG soft-delete.
 */
@Schema({ collection: 'scrap_notes', timestamps: true })
export class ScrapNote {
  /** Mã phiếu hủy nghiệp vụ; sparse để dữ liệu legacy vẫn đọc được. */
  @Prop({ unique: true, sparse: true })
  scrapNoteNumber?: string;

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

ScrapNoteSchema.index({ status: 1 });
