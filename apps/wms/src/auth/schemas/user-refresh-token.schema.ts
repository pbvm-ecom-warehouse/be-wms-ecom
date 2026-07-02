import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * Refresh token nhân viên (rotation). Nhóm TOKEN → chỉ createdAt + revokedAt
 * (không updatedAt). Lưu HASH (sha256) của token, không lưu token gốc.
 */
@Schema({
  collection: 'user_refresh_tokens',
  timestamps: { createdAt: true, updatedAt: false },
})
export class UserRefreshToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  tokenHash: string; // sha256(token gốc) — tra cứu trực tiếp khi refresh

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null; // set khi logout hoặc bị xoay (rotate)
}

export type UserRefreshTokenDocument = HydratedDocument<UserRefreshToken>;
export const UserRefreshTokenSchema =
  SchemaFactory.createForClass(UserRefreshToken);
