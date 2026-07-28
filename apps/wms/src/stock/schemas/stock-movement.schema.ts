import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum MovementType {
  RECEIVE = 'RECEIVE',
  PUTAWAY = 'PUTAWAY',
  ISSUE = 'ISSUE',
  ADJUST = 'ADJUST',
  SCRAP = 'SCRAP',
  PRINT_CONSUME = 'PRINT_CONSUME',
  PRINT_OUTPUT = 'PRINT_OUTPUT',
  RETURN_IN = 'RETURN_IN',
  RESERVE = 'RESERVE',
  RELEASE = 'RELEASE',
}

/**
 * Sổ cái tồn kho — append-only, BẤT BIẾN.
 * Mọi biến động (nhập/xuất/điều chỉnh/hủy/in) đều tạo 1 movement.
 * quantity có dấu: +nhập, -xuất.
 * refType + refId trỏ về chứng từ gốc (vd refType='grn', refId=ObjectId).
 * Audit: chỉ createdAt + createdBy — KHÔNG updatedAt, KHÔNG deletedAt.
 */
@Schema({
  collection: 'stock_movements',
  timestamps: { createdAt: true, updatedAt: false },
})
export class StockMovement {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  itemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  shelfId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  cellId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  lotId!: Types.ObjectId | null;

  @Prop({ enum: MovementType, required: true })
  type!: MovementType;

  /** Số lượng có dấu: dương = nhập vào, âm = xuất ra. Luôn là số thùng (số nguyên). */
  @Prop({
    required: true,
    validate: {
      validator: Number.isInteger,
      message: 'quantity phải là số nguyên',
    },
  })
  quantity!: number;

  /** Chỉ để hiển thị tham khảo (vd "= 24 cái") — không dùng để tính toán số lượng. */
  @Prop({ type: Number })
  packageFactor?: number;

  @Prop({ type: Number })
  packageVolumeCm3Snapshot?: number;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  suggestedCellId?: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  actualCellId?: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false })
  isOverride!: boolean;

  /** Loại chứng từ nguồn (vd 'grn', 'goods_issue', 'stock_count') */
  @Prop({ required: true })
  refType!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  refId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  createdBy!: Types.ObjectId;
}

export type StockMovementDocument = HydratedDocument<StockMovement>;
export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

StockMovementSchema.index({ itemId: 1, createdAt: -1 });
StockMovementSchema.index({ refType: 1, refId: 1 }); // truy vết bút toán của 1 chứng từ
