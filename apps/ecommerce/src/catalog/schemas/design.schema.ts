import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Thư viện design của khách — upload 1 lần, tái dùng nhiều đơn.
 * Khi khách chọn variant CUSTOM_PRINT: upload mới hoặc chọn từ thư viện này.
 * lastUsedAt cập nhật mỗi lần tái dùng → sắp xếp "dùng gần đây" khi hiển thị.
 */
@Schema({ collection: 'designs', timestamps: true })
export class Design {
  /** Chỉ chủ sở hữu mới thấy/dùng design này */
  @Prop({ required: true, type: Types.ObjectId, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  /** URL file gốc (artwork) — lưu sau khi upload thành công */
  @Prop({ required: true })
  file: string;

  /** URL ảnh xem trước (thumbnail) */
  @Prop({ default: '' })
  thumbnail: string;

  /** Cập nhật mỗi lần khách dùng lại design → dùng để sort "gần đây nhất" */
  @Prop({ type: Date, default: null })
  lastUsedAt: Date | null;
}

export type DesignDocument = HydratedDocument<Design>;
export const DesignSchema = SchemaFactory.createForClass(Design);
