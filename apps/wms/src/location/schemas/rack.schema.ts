import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'racks', timestamps: true })
export class Rack {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  zoneId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  code!: string;

  /** Vị trí rack trên sơ đồ — KHÔNG có kích thước ở đây. Kích thước
   * (widthM/depthM/levelCount/bayCount) dùng chung toàn app, đọc từ
   * RackTemplate singleton (xem rack-template.schema.ts) để sửa 1 chỗ là
   * đổi kích thước mọi rack cùng lúc — đúng yêu cầu "kệ đồng bộ toàn app". */
  @Prop({ type: Number, default: 0 })
  xM!: number;

  @Prop({ type: Number, default: 0 })
  yM!: number;

  @Prop({ type: Number, enum: [0, 90], default: 0 })
  rotation!: number;

  /** Điểm nhân viên đứng để thao tác với rack — dùng làm điểm neo khi tính route. */
  @Prop({ type: Number, default: 0 })
  accessPointXM!: number;

  @Prop({ type: Number, default: 0 })
  accessPointYM!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type RackDocument = HydratedDocument<Rack>;
export const RackSchema = SchemaFactory.createForClass(Rack);
RackSchema.index({ zoneId: 1, deletedAt: 1 });
RackSchema.index(
  { zoneId: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
