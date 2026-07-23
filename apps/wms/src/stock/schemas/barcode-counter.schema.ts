import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Sequence atomic theo prefix (chỉ '20' hiện tại) — cấp qua findOneAndUpdate
 * $inc trong transaction cùng lúc tạo item (barcode.repository.ts), không
 * dùng timestamps vì đây là bộ đếm thuần, chỉ cần biết lần cập nhật gần nhất.
 */
@Schema({ collection: 'barcode_counters', timestamps: { updatedAt: true, createdAt: false } })
export class BarcodeCounter {
  @Prop({ required: true, unique: true })
  prefix!: string;

  @Prop({ required: true, default: 0 })
  seq!: number;
}

export type BarcodeCounterDocument = HydratedDocument<BarcodeCounter>;
export const BarcodeCounterSchema = SchemaFactory.createForClass(BarcodeCounter);
