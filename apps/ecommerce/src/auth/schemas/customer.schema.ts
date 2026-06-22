import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
}

@Schema({ _id: true })
export class CustomerAddress {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  recipientName: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  line: string;

  @Prop({ required: true })
  ward: string;

  @Prop({ required: true })
  district: string;

  @Prop({ required: true })
  province: string;

  @Prop({ default: false })
  isDefault: boolean;
}

export const CustomerAddressSchema =
  SchemaFactory.createForClass(CustomerAddress);

@Schema({ collection: 'customers', timestamps: true })
export class Customer {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop()
  name?: string;

  @Prop()
  phone?: string;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ enum: CustomerStatus, default: CustomerStatus.ACTIVE })
  status: CustomerStatus;

  @Prop({ type: [CustomerAddressSchema], default: [] })
  addresses: CustomerAddress[];

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
