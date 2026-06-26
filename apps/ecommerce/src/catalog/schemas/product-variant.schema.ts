import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum FulfillmentType {
  STANDARD = 'STANDARD',
  PRINTED_TEMPLATE = 'PRINTED_TEMPLATE',
  CUSTOM_PRINT = 'CUSTOM_PRINT',
}

/**
 * Biến thể sản phẩm — mỗi variant gắn với 1 SKU WMS duy nhất.
 * `availableQty` là bản copy WMS sync qua event `stock.changed` (match theo sku).
 * `fulfillmentType` quyết định luồng đặt hàng: STANDARD/PRINTED_TEMPLATE mua như hàng thường,
 * CUSTOM_PRINT bắt buộc kèm design (make-to-order, chỉ thanh toán ONLINE).
 */
@Schema({ collection: 'product_variants', timestamps: true })
export class ProductVariant {
  @Prop({ required: true, unique: true, index: true })
  sku: string;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  productId: Types.ObjectId;

  /** Phân biệt biến thể, ví dụ: { size: 'M' } */
  @Prop({ type: Object, default: {} })
  attributes: Record<string, string>;

  @Prop({ required: true, min: 0 })
  price: number;

  /** Bản copy WMS — cập nhật qua consumer stock.changed */
  @Prop({ default: 0 })
  availableQty: number;

  @Prop({ enum: FulfillmentType, default: FulfillmentType.STANDARD })
  fulfillmentType: FulfillmentType;

  @Prop({ default: true })
  isActive: boolean;
}

export type ProductVariantDocument = HydratedDocument<ProductVariant>;
export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

// Index cho search: productId + isActive thường query cùng nhau
ProductVariantSchema.index({ productId: 1, isActive: 1 });

