import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserFcmTokenDocument = UserFcmToken & Document;

@Schema({ collection: 'user_fcm_tokens', timestamps: true })
export class UserFcmToken {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  fcmToken: string;

  @Prop({ default: 'mobile' })
  deviceType?: string;
}

export const UserFcmTokenSchema = SchemaFactory.createForClass(UserFcmToken);
