import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  HIDDEN = 'HIDDEN',
}

export class SeoMeta {
  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop({ type: [String], default: [] })
  keywords?: string[];
}

/**
 * Entity marketing — là "bìa sách" cho các ProductVariant.
 * Chỉ status=ACTIVE mới hiện ở storefront. DRAFT để soạn thảo, HIDDEN để ẩn tạm.
 */
@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ required: true, type: Types.ObjectId, index: true })
  categoryId: Types.ObjectId;

  @Prop({ enum: ProductStatus, default: ProductStatus.DRAFT, index: true })
  status: ProductStatus;

  @Prop({ type: Object, default: {} })
  seo: SeoMeta;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
