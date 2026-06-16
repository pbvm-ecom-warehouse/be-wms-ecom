import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * Refresh token khách (rotation). Nhóm TOKEN → chỉ createdAt + revokedAt.
 * Lưu HASH (sha256) của token, không lưu token gốc.
 */
@Schema({
  collection: 'customer_refresh_tokens',
  timestamps: { createdAt: true, updatedAt: false },
})
export class CustomerRefreshToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, index: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;
}

export type CustomerRefreshTokenDocument =
  HydratedDocument<CustomerRefreshToken>;
export const CustomerRefreshTokenSchema =
  SchemaFactory.createForClass(CustomerRefreshToken);
