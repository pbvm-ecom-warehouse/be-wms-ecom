import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * Refresh token cho cả customer và admin trong Ecommerce.
 * Lưu HASH (sha256) của token.
 */
@Schema({
  collection: 'user_refresh_tokens',
  timestamps: { createdAt: true, updatedAt: false },
})
export class UserRefreshToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;
}

export type UserRefreshTokenDocument = HydratedDocument<UserRefreshToken>;
export const UserRefreshTokenSchema =
  SchemaFactory.createForClass(UserRefreshToken);
