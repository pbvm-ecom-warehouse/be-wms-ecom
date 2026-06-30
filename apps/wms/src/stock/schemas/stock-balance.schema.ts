import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * Lớp 1 tồn kho — snapshot tổng per (item, warehouse).
 * available = onHand - reserved - expired → đây là số đẩy sang Ecommerce.
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

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  warehouseId!: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  onHand!: number;

  @Prop({ required: true, default: 0 })
  reserved!: number;

  @Prop({ required: true, default: 0 })
  expired!: number;

  /** Ngưỡng cảnh báo hàng sắp hết — bắn event stock.low khi available < minQuantity */
  @Prop({ default: 0 })
  minQuantity!: number;
}

export type StockBalanceDocument = HydratedDocument<StockBalance>;
export const StockBalanceSchema = SchemaFactory.createForClass(StockBalance);

// 1 bản ghi duy nhất per (item, warehouse) — upsert theo compound key này
StockBalanceSchema.index({ itemId: 1, warehouseId: 1 }, { unique: true });
