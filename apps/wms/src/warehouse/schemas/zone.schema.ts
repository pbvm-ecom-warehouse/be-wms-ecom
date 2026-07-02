import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'zones', timestamps: true })
export class Zone {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  warehouseId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  code!: string;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type ZoneDocument = HydratedDocument<Zone>;
export const ZoneSchema = SchemaFactory.createForClass(Zone);
ZoneSchema.index({ warehouseId: 1, deletedAt: 1 });
ZoneSchema.index(
  { warehouseId: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
