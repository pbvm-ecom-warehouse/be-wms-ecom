import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * Danh mục giá: mỗi cặp (SKU, NCC) là 1 báo giá độc lập — 1 SKU có thể mua
 * được từ nhiều NCC khác nhau, cần lưu song song để so sánh giá trước khi
 * đặt PO (issue #30). Không soft-delete — toggle isActive khi hết hiệu lực.
 * updatedAt tự update qua timestamps.
 */
@Schema({
  collection: 'supplier_items',
  timestamps: { createdAt: false, updatedAt: true },
})
export class SupplierItem {
  /** WarehouseItem._id — không unique riêng lẻ: 1 SKU có thể có nhiều NCC báo giá
   * song song (xem compound index bên dưới, ràng buộc theo cặp itemId+supplierId). */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
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

  // purchasePrice ảnh hưởng trực tiếp giá auto-fill lên PO — cần truy vết
  // ai sửa/khi nào, không chỉ dựa vào updatedAt (issue #33).
  @Prop({ type: SchemaTypes.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId })
  updatedBy?: Types.ObjectId;
}

export type SupplierItemDocument = HydratedDocument<SupplierItem>;
export const SupplierItemSchema = SchemaFactory.createForClass(SupplierItem);

// 1 cặp (SKU, NCC) chỉ có đúng 1 báo giá — nhiều NCC có thể cùng báo giá 1 SKU,
// nhưng không được trùng 2 báo giá cho cùng 1 cặp.
SupplierItemSchema.index({ itemId: 1, supplierId: 1 }, { unique: true });
