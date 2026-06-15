import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { WmsRole } from '@app/auth';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** Trạng thái tài khoản nhân viên. */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
}

/**
 * Nhân viên WMS — danh bạ nhân viên DUY NHẤT cho cả kho lẫn back-office shop.
 * Nhóm MASTER → audit đầy đủ + soft-delete (deletedAt). collection giữ tên 'users'.
 */
@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop()
  email?: string;

  // select:false → KHÔNG trả hash ra ngoài theo mặc định; login phải .select('+passwordHash').
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop()
  name?: string;

  @Prop({ type: [String], enum: WmsRole, default: [] })
  roles: string[];

  @Prop({ enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ type: SchemaTypes.ObjectId })
  warehouseId?: Types.ObjectId; // kho mặc định (ref scalar, không populate xuyên app)

  @Prop({ default: false })
  mustChangePassword: boolean;

  // ---- audit (master) ----
  @Prop({ type: SchemaTypes.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ default: null })
  deletedAt?: Date | null; // soft-delete: query luôn lọc deletedAt: null
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
