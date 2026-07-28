import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * Lớp 2 tồn kho — snapshot chi tiết per (item, shelf, lot).
 * lotId nullable với hàng không perishable.
 * Audit: chỉ updatedAt (snapshot — không createdAt, không soft-delete).
 * Mỗi vị trí shelf + lot của một item = 1 bản ghi.
 */
@Schema({
  collection: 'inventory_stocks',
  timestamps: { createdAt: false, updatedAt: true },
})
export class InventoryStock {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  itemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  shelfId!: Types.ObjectId;

  /** StorageCell._id; null = tồn cũ/chưa phân khoang hoặc staging. */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  cellId!: Types.ObjectId | null;

  /** null với hàng không perishable */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  @Prop({ required: true, default: 0 })
  quantity!: number;

  @Prop({ type: Number, default: 0 })
  packageCount!: number;

  @Prop({ type: Number })
  packageFactor?: number;

  @Prop({ type: Number })
  packageVolumeCm3Snapshot?: number;
}

export type InventoryStockDocument = HydratedDocument<InventoryStock>;
export const InventoryStockSchema =
  SchemaFactory.createForClass(InventoryStock);

// 1 bản ghi per (item, shelf, lot) — lotId có thể null nên dùng compound 3 chiều
InventoryStockSchema.index(
  { itemId: 1, shelfId: 1, cellId: 1, lotId: 1 },
  { unique: true },
);
InventoryStockSchema.index({ shelfId: 1 }); // query tồn theo shelf
InventoryStockSchema.index({ cellId: 1 }); // query tồn theo khoang
