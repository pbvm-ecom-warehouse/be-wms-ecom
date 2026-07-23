import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ItemType {
  MATERIAL = 'MATERIAL',
  CUP_BLANK = 'CUP_BLANK',
  CUP_PRINTED = 'CUP_PRINTED',
  PACKAGING = 'PACKAGING',
}

/** Sub-document: đơn vị thay thế (vd thùng = 24 cái) */
@Schema({ _id: false })
class AltUnit {
  @Prop({ required: true })
  unit!: string;

  /** factor * unit_cơ_sở = 1 altUnit (vd 1 thùng = 24 cái → factor = 24) */
  @Prop({ required: true })
  factor!: number;
}
const AltUnitSchema = SchemaFactory.createForClass(AltUnit);

/** Sub-document: thuộc tính thêm (màu, kích thước…) — snapshot từ ItemAttributeOption tại thời điểm tạo item. */
@Schema({ _id: false })
class ItemAttribute {
  /** Nhóm thuộc tính (vd 'COLOR') — khớp AttributeOptionKey, giữ dạng string ở đây để schema WarehouseItem không phụ thuộc trực tiếp enum của attribute-option module. */
  @Prop({ required: true })
  key!: string;

  @Prop({ type: Types.ObjectId, required: true })
  optionId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  value!: string;

  /** Mã định danh thuộc tính — dùng khi map với hệ thống ngoài hoặc filter theo loại */
  @Prop({ required: true })
  code!: string;
}
const ItemAttributeSchema = SchemaFactory.createForClass(ItemAttribute);

/**
 * Master data mặt hàng kho. `sku` là khóa liên kết với ProductVariant bên Ecommerce.
 * Dùng soft-delete (deletedAt) vì là master data — không xóa vật lý.
 */
@Schema({ collection: 'warehouse_items', timestamps: true })
export class WarehouseItem {
  @Prop({ required: true, unique: true })
  sku!: string;

  @Prop()
  barcode?: string;

  /** Mã NCC/EAN/UPC phụ — quét về cùng 1 item */
  @Prop({ type: [String], default: [] })
  altBarcodes!: string[];

  @Prop({ required: true })
  name!: string;

  @Prop({ enum: ItemType, required: true })
  type!: ItemType;

  /** Nhóm con trong itemType (vd 'SYRUP' cho MATERIAL) — null cho CUP_BLANK (không phân nhóm). Khớp SkuTemplate.category. */
  @Prop()
  category?: string;

  /** Đơn vị cơ sở (vd "cái", "kg") */
  @Prop({ required: true })
  unit!: string;

  @Prop({ type: [AltUnitSchema], default: [] })
  altUnits!: AltUnit[];

  @Prop({ type: [ItemAttributeSchema], default: [] })
  attributes!: ItemAttribute[];

  /** true = hàng có hạn sử dụng, cần track Lot */
  @Prop({ default: false })
  isPerishable!: boolean;

  /** Số ngày trước hạn để đánh dấu "sắp hết hạn" */
  @Prop({ type: Number })
  nearExpiryDays?: number;

  /** Ngưỡng tối thiểu — available (= onHand-reserved-expired) < minQuantity thì WMS phát
   * stock.low cho MANAGER. undefined = item này không bao giờ cảnh báo thấp tồn. */
  @Prop({ type: Number })
  minQuantity?: number;

  /** Chiều sâu 1 đơn vị cơ sở (cm) — dùng tính unitVolume cho gợi ý put-away */
  @Prop({ type: Number })
  depth?: number;

  /** Chiều rộng 1 đơn vị cơ sở (cm) */
  @Prop({ type: Number })
  width?: number;

  /** Chiều cao 1 đơn vị cơ sở (cm) */
  @Prop({ type: Number })
  height?: number;

  @Prop({ default: true })
  isActive!: boolean;

  /** Ảnh mặt hàng — URL Cloudinary, optional, nhiều ảnh. */
  @Prop({ type: [String], default: [] })
  images!: string[];

  /** Chỉ có ý nghĩa khi type=CUP_PRINTED — trỏ về WarehouseItem CUP_BLANK gốc dùng làm nguyên liệu in (UC-04). */
  @Prop({ type: Types.ObjectId })
  blankItemId?: Types.ObjectId;

  // audit master data (5 field theo data-and-mongoose.md)
  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type WarehouseItemDocument = HydratedDocument<WarehouseItem>;
export const WarehouseItemSchema = SchemaFactory.createForClass(WarehouseItem);

WarehouseItemSchema.index({ deletedAt: 1 });
WarehouseItemSchema.index({ barcode: 1 }, { sparse: true });
