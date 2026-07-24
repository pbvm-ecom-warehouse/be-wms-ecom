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
