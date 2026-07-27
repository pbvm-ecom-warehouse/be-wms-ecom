import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Cổng nhập/xuất trên sơ đồ kho — điểm gốc tham chiếu khi tính route điều hướng. */
@Schema({ collection: 'gates', timestamps: true })
export class Gate {
  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ type: Number, default: 0 })
  xM!: number;

  @Prop({ type: Number, default: 0 })
  yM!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type GateDocument = HydratedDocument<Gate>;
export const GateSchema = SchemaFactory.createForClass(Gate);
GateSchema.index({ deletedAt: 1 });
GateSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
