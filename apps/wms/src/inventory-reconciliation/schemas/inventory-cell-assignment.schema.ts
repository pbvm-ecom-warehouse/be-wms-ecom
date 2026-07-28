import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** Audit riêng cho việc phân khoang tồn cũ; không giả lập StockMovement lịch sử. */
@Schema({
  collection: 'inventory_cell_assignments',
  timestamps: { createdAt: true, updatedAt: false },
})
export class InventoryCellAssignment {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  sourceInventoryId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  itemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  sourceShelfId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  actualShelfId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  cellId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  /** Số thùng — luôn là số nguyên. */
  @Prop({ required: true })
  quantity!: number;

  /** Chỉ để hiển thị tham khảo — không dùng để tính toán số lượng. */
  @Prop()
  packageFactor?: number;

  @Prop({ required: true })
  packageVolumeCm3Snapshot!: number;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  assignedBy!: Types.ObjectId;
}

export type InventoryCellAssignmentDocument =
  HydratedDocument<InventoryCellAssignment>;
export const InventoryCellAssignmentSchema = SchemaFactory.createForClass(
  InventoryCellAssignment,
);
InventoryCellAssignmentSchema.index({ sourceInventoryId: 1, createdAt: -1 });
InventoryCellAssignmentSchema.index({ cellId: 1, createdAt: -1 });
