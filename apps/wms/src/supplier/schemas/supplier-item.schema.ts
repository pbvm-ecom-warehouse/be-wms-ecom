import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * Danh mục giá: 1 SKU ↔ 1 NCC chính (unique itemId).
 * Không soft-delete — toggle isActive khi hết hiệu lực báo giá.
 * updatedAt tự update qua timestamps.
 */
@Schema({
  collection: 'supplier_items',
  timestamps: { createdAt: false, updatedAt: true },
})
export class SupplierItem {
  /** WarehouseItem._id — unique: 1 SKU chỉ có 1 NCC chính */
  @Prop({ type: SchemaTypes.ObjectId, required: true, unique: true })
  itemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  supplierId!: Types.ObjectId;

  /** Mã hàng phía NCC để đối chiếu khi đặt hàng */
  @Prop()
  supplierItemCode?: string;

  /** Giá nhập gợi ý (sửa tay được khi tạo PO) */
  @Prop({ type: Number, required: true, min: 0 })
  purchasePrice!: number;

  /** Số ngày giao dự kiến */
  @Prop({ type: Number, min: 0 })
  leadTimeDays?: number;

  /** Số lượng đặt tối thiểu (MOQ) */
  @Prop({ type: Number, min: 0 })
  minOrderQty?: number;

  /** false = báo giá hết hiệu lực, không gợi ý khi tạo PO */
  @Prop({ default: true })
  isActive!: boolean;
}

export type SupplierItemDocument = HydratedDocument<SupplierItem>;
export const SupplierItemSchema = SchemaFactory.createForClass(SupplierItem);
