import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Cây danh mục — tự tham chiếu qua parentId.
 * Null parentId = danh mục gốc (root). position dùng sắp thứ tự hiển thị.
 */
@Schema({ collection: 'categories', timestamps: true })
export class Category {
  @Prop({ required: true })
  name: string;

  /** URL-friendly, unique trên toàn bộ categories */
  @Prop({ required: true, unique: true, index: true })
  slug: string;

  /** Null = root category */
  @Prop({ type: Types.ObjectId, default: null, index: true })
  parentId: Types.ObjectId | null;

  /** Thứ tự hiển thị giữa các siblings */
  @Prop({ default: 0 })
  position: number;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
