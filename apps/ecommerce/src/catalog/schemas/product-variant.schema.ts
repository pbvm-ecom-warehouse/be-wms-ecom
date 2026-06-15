import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Schema Mongoose TỐI THIỂU cho biến thể sản phẩm — đủ cho ví dụ consumer tồn kho.
 * `availableQty` là BẢN COPY do WMS sync qua event stock.changed (match theo sku).
 * Bản đầy đủ (theo apps/ecommerce/prisma/schema.prisma) sẽ convert sau.
 */
@Schema({ collection: 'product_variants', timestamps: true })
export class ProductVariant {
  @Prop({ required: true, unique: true })
  sku: string;

  @Prop({ default: 0 })
  availableQty: number;
}

export type ProductVariantDocument = HydratedDocument<ProductVariant>;
export const ProductVariantSchema =
  SchemaFactory.createForClass(ProductVariant);
