import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Schema Mongoose TỐI THIỂU cho mặt hàng kho — chỉ đủ cho ví dụ producer tồn kho.
 * Bản đầy đủ (đầy đủ field theo apps/wms/prisma/schema.prisma) sẽ convert sau.
 * `sku` là khóa liên kết Ecommerce. collection giữ tên snake_case như cũ.
 */
@Schema({ collection: 'warehouse_items', timestamps: true })
export class WarehouseItem {
  @Prop({ required: true, unique: true })
  sku: string;

  @Prop({ required: true })
  name: string;
}

export type WarehouseItemDocument = HydratedDocument<WarehouseItem>;
export const WarehouseItemSchema = SchemaFactory.createForClass(WarehouseItem);
