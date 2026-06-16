import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Trạng thái tài khoản khách. */
export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
}

/**
 * Khách hàng Ecommerce. Nhóm MASTER → audit + soft-delete (deletedAt).
 * collection giữ tên 'customers'. KHÔNG dùng chung với users (wms_db).
 */
@Schema({ collection: 'customers', timestamps: true })
export class Customer {
  @Prop({ required: true, unique: true })
  email: string;

  // Không trả hash ra ngoài mặc định; login phải .select('+passwordHash').
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

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
