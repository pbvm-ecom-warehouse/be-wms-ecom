import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserFcmToken } from '../schemas/user-fcm-token.schema';

@Injectable()
export class UserFcmTokenRepository {
  constructor(
    @InjectModel(UserFcmToken.name)
    private readonly fcmTokenModel: Model<UserFcmToken>,
  ) {}

  async upsertToken(
    customerId: string | Types.ObjectId,
    fcmToken: string,
    deviceType = 'mobile',
  ): Promise<UserFcmToken> {
    const cId = new Types.ObjectId(customerId.toString());
    return this.fcmTokenModel
      .findOneAndUpdate(
        { fcmToken },
        { customerId: cId, fcmToken, deviceType },
        { upsert: true, new: true },
      )
      .lean();
  }

  async findTokensByCustomerId(
    customerId: string | Types.ObjectId,
  ): Promise<string[]> {
    const cId = new Types.ObjectId(customerId.toString());
    const docs = await this.fcmTokenModel.find({ customerId: cId }).lean();
    return docs.map((doc) => doc.fcmToken);
  }

  async deleteToken(
    customerId: string | Types.ObjectId,
    fcmToken: string,
  ): Promise<void> {
    const cId = new Types.ObjectId(customerId.toString());
    await this.fcmTokenModel.deleteOne({ customerId: cId, fcmToken });
  }
}
