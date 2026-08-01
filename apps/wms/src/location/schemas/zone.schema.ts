import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ItemType } from '../../stock/schemas/warehouse-item.schema';

export enum ZonePurpose {
  STORAGE = 'STORAGE',
  SCRAP = 'SCRAP',
}

@Schema({ collection: 'zones', timestamps: true })
export class Zone {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  code!: string;

  /** STORAGE dùng cho tồn có thể bán/xuất; SCRAP là khu cách ly chờ tiêu hủy. */
  @Prop({ enum: ZonePurpose, default: ZonePurpose.STORAGE })
  zonePurpose!: ZonePurpose;

  /** Rỗng = khu lưu trữ chung. Khu chuyên biệt chỉ nhận đúng ItemType. */
  @Prop({ type: [String], enum: ItemType, default: [] })
  allowedItemTypes!: ItemType[];

  /** Toạ độ góc trên-trái trên sơ đồ kho, đơn vị mét. */
  @Prop({ type: Number, default: 0 })
  xM!: number;

  @Prop({ type: Number, default: 0 })
  yM!: number;

  @Prop({ type: Number, default: 0 })
  widthM!: number;

  @Prop({ type: Number, default: 0 })
  heightM!: number;

  /** 0 hoặc 90 độ — xoay hình chữ nhật trên map, không xoay tự do. */
  @Prop({ type: Number, enum: [0, 90], default: 0 })
  rotation!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type ZoneDocument = HydratedDocument<Zone>;
export const ZoneSchema = SchemaFactory.createForClass(Zone);
ZoneSchema.index({ deletedAt: 1 });
ZoneSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
ZoneSchema.index(
  { zonePurpose: 1 },
  {
    unique: true,
    partialFilterExpression: {
      zonePurpose: ZonePurpose.SCRAP,
      deletedAt: null,
    },
  },
);
