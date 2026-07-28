import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum GoodsReturnStatus {
  DRAFT = 'DRAFT',
  INSPECTED = 'INSPECTED',
  RESTOCKED = 'RESTOCKED',
  CANCELLED = 'CANCELLED',
}

export enum GoodsReturnItemCondition {
  GOOD = 'GOOD',
  DAMAGED = 'DAMAGED',
}

/**
 * Sub-document: 1 dòng hàng hoàn — 1 itemId cụ thể. Không audit riêng — kế
 * thừa từ GoodsReturn cha. condition/shelfId/lotId là null cho tới khi
 * RECEIVER inspect (xem goods-return.service.ts) — không kiểm tra tình
 * trạng cùng lúc tạo phiếu vì hàng vật lý phải đã về tới kho mới biết được.
 */
@Schema({ _id: false })
export class GoodsReturnItem {
  @Prop({ type: Types.ObjectId, required: true })
  itemId!: Types.ObjectId;

  /** Denormalized từ WarehouseItem.sku — để hiển thị, không dùng để tính lại */
  @Prop({ required: true })
  sku!: string;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'quantity phải là số nguyên',
    },
  })
  quantity!: number;

  /** null cho tới khi inspect — RECEIVER phân loại GOOD/DAMAGED */
  @Prop({ type: String, enum: GoodsReturnItemCondition, default: null })
  condition!: GoodsReturnItemCondition | null;

  /**
   * Vị trí nhập lại (condition=GOOD) hoặc nhập tạm trước khi hủy ngay
   * (condition=DAMAGED) — set lúc inspect.
   */
  @Prop({ type: Types.ObjectId, default: null })
  shelfId!: Types.ObjectId | null;

  /** Bắt buộc nếu item.isPerishable && condition=GOOD (xem inspectGoodsReturn) */
  @Prop({ type: Types.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  /**
   * Set sau confirm() nếu condition=DAMAGED — trỏ tới ScrapNote (đã APPROVED)
   * được tự động tạo cho dòng này, dùng để truy vết audit trail.
   */
  @Prop({ type: Types.ObjectId, default: null })
  scrapNoteId!: Types.ObjectId | null;

  /** Ảnh minh chứng tình trạng hàng (đặc biệt DAMAGED) — set lúc inspect, optional. */
  @Prop({ type: [String], default: [] })
  images!: string[];
}
const GoodsReturnItemSchema = SchemaFactory.createForClass(GoodsReturnItem);

/**
 * Phiếu hoàn hàng (RMA, UC-09). Tự động sinh DRAFT khi WMS nhận event
 * order.returned (Ecom→WMS), hoặc RECEIVER tạo tay cho nguồn ngoài
 * Ecommerce (hàng lỗi NCC trả trực tiếp tại kho...). Chứng từ giao dịch —
 * hủy bằng status, KHÔNG soft-delete.
 */
@Schema({ collection: 'goods_returns', timestamps: true })
export class GoodsReturn {
  /**
   * Đơn gốc bên Ecommerce — lưu string (KHÔNG populate xuyên app, xem
   * architecture.md liên kết xuyên app chỉ bằng id scalar). Optional: phiếu
   * tạo tay không nhất thiết gắn với 1 đơn Ecommerce cụ thể.
   */
  @Prop()
  orderId?: string;

  @Prop({ enum: GoodsReturnStatus, default: GoodsReturnStatus.DRAFT })
  status!: GoodsReturnStatus;

  @Prop()
  note?: string;

  /**
   * null nếu phiếu tự sinh từ order.returned (chưa có actor con người nào
   * thao tác) — set thành actor thật khi RECEIVER inspect lần đầu.
   */
  @Prop({ type: Types.ObjectId, default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: [GoodsReturnItemSchema], required: true })
  items!: GoodsReturnItem[];
}

export type GoodsReturnDocument = HydratedDocument<GoodsReturn>;
export const GoodsReturnSchema = SchemaFactory.createForClass(GoodsReturn);

GoodsReturnSchema.index({ orderId: 1 });
GoodsReturnSchema.index({ status: 1 });
