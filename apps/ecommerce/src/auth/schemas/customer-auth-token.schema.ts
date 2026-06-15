import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** Loại token một-lần qua email. */
export enum AuthTokenType {
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

/**
 * Token một-lần cho xác minh email / đặt lại mật khẩu. Nhóm TOKEN → createdAt + usedAt.
 * Token gốc gửi qua Notification (event), DB chỉ lưu hash.
 */
@Schema({
  collection: 'customer_auth_tokens',
  timestamps: { createdAt: true, updatedAt: false },
})
export class CustomerAuthToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ enum: AuthTokenType, required: true })
  type: AuthTokenType;

  @Prop({ required: true, index: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: null })
  usedAt?: Date | null; // dùng một-lần
}

export type CustomerAuthTokenDocument = HydratedDocument<CustomerAuthToken>;
export const CustomerAuthTokenSchema =
  SchemaFactory.createForClass(CustomerAuthToken);
