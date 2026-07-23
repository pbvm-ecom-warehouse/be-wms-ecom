import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Nhóm thuộc tính hợp lệ — cố định theo template registry (sku-template.registry.ts).
 * ADMIN chỉ tạo option TRONG các key này, không tự thêm key mới (ngoài scope issue #25:
 * "ADMIN tự thiết kế template/category mới trên UI").
 */
export enum AttributeOptionKey {
  // Cup
  CUP_STYLE = 'CUP_STYLE',
  MATERIAL = 'MATERIAL',
  CAPACITY = 'CAPACITY',
  COLOR = 'COLOR',
  // Material
  MATERIAL_CATEGORY = 'MATERIAL_CATEGORY',
  MATERIAL_TYPE = 'MATERIAL_TYPE',
  FLAVOR = 'FLAVOR',
  SPEC = 'SPEC',
  // Packaging
  PACKAGING_CATEGORY = 'PACKAGING_CATEGORY',
  PACKAGING_STYLE = 'PACKAGING_STYLE',
  COMPATIBILITY = 'COMPATIBILITY',
  DIAMETER = 'DIAMETER',
  LENGTH = 'LENGTH',
  SIZE = 'SIZE',
}

/**
 * Option giá trị thuộc tính (vd key=COLOR, code=CLR, name="Trong suốt") dùng để
 * ADMIN quản lý danh sách giá trị hợp lệ cho mỗi field template, KHÔNG phải để
 * ADMIN đổi cấu trúc template. Soft-delete + deactivate tách biệt: deactivate
 * (isActive=false) là thao tác thường xuyên (ẩn khỏi lựa chọn mới, option cũ
 * vẫn hiển thị đúng trên item đã tạo); soft-delete gần như không dùng tới vì
 * option đã dùng không được xóa vật lý (xem STOCK_ATTRIBUTE_CODE_IMMUTABLE).
 */
@Schema({ collection: 'item_attribute_options', timestamps: true })
export class ItemAttributeOption {
  @Prop({ enum: AttributeOptionKey, required: true })
  key!: AttributeOptionKey;

  @Prop({ required: true })
  name!: string;

  /** Đoạn mã ngắn dùng ghép vào SKU (vd "CLR", "HRT") — unique trong cùng key. */
  @Prop({ required: true })
  code!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type ItemAttributeOptionDocument = HydratedDocument<ItemAttributeOption>;
export const ItemAttributeOptionSchema = SchemaFactory.createForClass(
  ItemAttributeOption,
);

ItemAttributeOptionSchema.index({ key: 1, code: 1 }, { unique: true });
ItemAttributeOptionSchema.index({ key: 1, isActive: 1 });
ItemAttributeOptionSchema.index({ deletedAt: 1 });
