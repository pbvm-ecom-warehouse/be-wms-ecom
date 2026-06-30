import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum SupplierStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLACKLIST = 'BLACKLIST',
}

/** Master data nhà cung cấp — soft-delete, audit đầy đủ */
@Schema({ collection: 'suppliers', timestamps: true })
export class Supplier {
  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  contactName?: string;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;

  @Prop()
  taxCode?: string;

  @Prop({ enum: SupplierStatus, default: SupplierStatus.ACTIVE })
  status!: SupplierStatus;

  @Prop()
  note?: string;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type SupplierDocument = HydratedDocument<Supplier>;
export const SupplierSchema = SchemaFactory.createForClass(Supplier);
SupplierSchema.index({ deletedAt: 1 });
