import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Bộ đếm mã chứng từ theo loại + ngày. `findOneAndUpdate($inc)` đảm bảo hai
 * request đồng thời không nhận cùng sequence.
 */
@Schema({ collection: 'document_counters', versionKey: false })
export class DocumentCounter {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  sequence!: number;
}

export type DocumentCounterDocument = HydratedDocument<DocumentCounter>;
export const DocumentCounterSchema =
  SchemaFactory.createForClass(DocumentCounter);
