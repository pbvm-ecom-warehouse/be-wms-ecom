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
 * Mỗi nhân viên chỉ có ĐÚNG 1 role (không multi-role).
 */
@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ unique: true, sparse: true })
  firebaseUid?: string;

  // sparse: true — email là optional, nếu unique thường thì 2 user cùng thiếu
  // email (undefined) sẽ đụng unique index (Mongo coi 2 field vắng mặt là
  // trùng nhau). sparse bỏ qua document không có field này khỏi index.
  @Prop({ unique: true, sparse: true })
  email?: string;

  // select:false → KHÔNG trả hash ra ngoài theo mặc định; login phải .select('+passwordHash').
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop()
  name?: string;

  @Prop({ type: String, enum: WmsRole, required: true })
  role: WmsRole;

  @Prop({ enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ type: SchemaTypes.ObjectId })
  warehouseId?: Types.ObjectId; // kho mặc định (ref scalar, không populate xuyên app)

  @Prop({ default: false })
  mustChangePassword: boolean;

  /** Ảnh đại diện — user tự upload qua POST auth/me/avatar, optional. */
  @Prop()
  avatarUrl?: string;

  // ---- audit (master) ----
  @Prop({ type: SchemaTypes.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null; // soft-delete: query luôn lọc deletedAt: null
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
