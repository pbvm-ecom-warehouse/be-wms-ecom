import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum AisleType {
  MAIN = 'MAIN',
  RACK = 'RACK',
}

/** Lối đi trên sơ đồ kho — thuần phục vụ hiển thị 2D, không ảnh hưởng nghiệp vụ tồn kho. */
@Schema({ collection: 'aisles', timestamps: true })
export class Aisle {
  @Prop({ required: true })
  code!: string;

  @Prop({ enum: AisleType, required: true })
  type!: AisleType;

  @Prop({ type: Number, default: 0 })
  xM!: number;

  @Prop({ type: Number, default: 0 })
  yM!: number;

  @Prop({ type: Number, default: 0 })
  widthM!: number;

  @Prop({ type: Number, default: 0 })
  heightM!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type AisleDocument = HydratedDocument<Aisle>;
export const AisleSchema = SchemaFactory.createForClass(Aisle);
AisleSchema.index({ deletedAt: 1 });
AisleSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
