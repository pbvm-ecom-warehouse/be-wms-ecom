import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * Lớp 1 tồn kho — snapshot tổng per item.
 * available = onHand - reserved - expired - quarantined.
 * Nguồn sự thật đối soát là stock_movements (append-only).
 * Audit: chỉ updatedAt (snapshot — không có createdAt, không soft-delete).
 */
@Schema({
  collection: 'stock_balances',
  timestamps: { createdAt: false, updatedAt: true },
})
export class StockBalance {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  itemId!: Types.ObjectId;

  /** Số thùng — luôn là số nguyên (quyết định: quantity luôn là thùng, không quy đổi). */
  @Prop({
    required: true,
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'onHand phải là số nguyên',
    },
  })
  onHand!: number;

  @Prop({
    required: true,
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'reserved phải là số nguyên',
    },
  })
  reserved!: number;

  @Prop({
    required: true,
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'expired phải là số nguyên',
    },
  })
  expired!: number;

  /** Hàng bị khóa/chuyển khu hủy, loại khỏi available nhưng vẫn còn vật lý. */
  @Prop({
    required: true,
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'quarantined phải là số nguyên',
    },
  })
  quarantined!: number;

  /** Ngưỡng cảnh báo hàng sắp hết — bắn event stock.low khi available < minQuantity */
  @Prop({ default: 0 })
  minQuantity!: number;
}

export type StockBalanceDocument = HydratedDocument<StockBalance>;
export const StockBalanceSchema = SchemaFactory.createForClass(StockBalance);

// 1 bản ghi duy nhất per item — upsert theo key này (app = 1 kho duy nhất)
StockBalanceSchema.index({ itemId: 1 }, { unique: true });
