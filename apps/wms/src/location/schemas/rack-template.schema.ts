import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Kích thước rack dùng CHUNG toàn app — singleton (đúng 1 document).
 * Sửa field ở đây = đổi kích thước hiển thị/tính toán cho MỌI rack cùng lúc.
 * Không phải master data theo từng entity nên không có code/deletedAt.
 */
@Schema({ collection: 'rack_templates', timestamps: true })
export class RackTemplate {
  @Prop({ type: Number, required: true, default: 10 })
  widthM!: number;

  @Prop({ type: Number, required: true, default: 1.5 })
  depthM!: number;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  levelCount!: number;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  bayCount!: number;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export type RackTemplateDocument = HydratedDocument<RackTemplate>;
export const RackTemplateSchema = SchemaFactory.createForClass(RackTemplate);
