import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum CartStatus {
  ACTIVE = 'ACTIVE',       // đang dùng
  CONVERTED = 'CONVERTED', // đã checkout thành công
  ABANDONED = 'ABANDONED', // bỏ không dùng nữa
}

export class CartItem {
  @Prop({ required: true })
  sku: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  /** true khi variant là CUSTOM_PRINT — bắt buộc kèm designId + designFile */
  @Prop({ default: false })
  isPrintItem: boolean;

  @Prop({ default: null })
  designId?: string;   // ref Design._id (tùy chọn, để reuse)

  @Prop({ default: null })
  designFile?: string; // URL file artwork — snapshot tại thời điểm thêm giỏ

  /** Giá tại lúc thêm vào giỏ — dùng để hiển thị; giá chốt thật snapshot vào Order */
  @Prop({ required: true, min: 0 })
  unitPrice: number;
}

@Schema({ collection: 'carts', timestamps: true })
export class Cart {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  customerId: Types.ObjectId;

  @Prop({ enum: CartStatus, default: CartStatus.ACTIVE, index: true })
  status: CartStatus;

  @Prop({ type: [Object], default: [] })
  items: CartItem[];
}

export type CartDocument = HydratedDocument<Cart>;
export const CartSchema = SchemaFactory.createForClass(Cart);
