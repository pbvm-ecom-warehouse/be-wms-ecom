import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRefreshToken } from '../schemas/user-refresh-token.schema';

@Injectable()
export class UserRefreshTokenRepository {
  constructor(
    @InjectModel(UserRefreshToken.name)
    private readonly model: Model<UserRefreshToken>,
  ) {}

  /** Tìm refresh token còn hiệu lực (chưa bị thu hồi). */
  findValid(tokenHash: string) {
    return this.model.findOne({ tokenHash, revokedAt: null }).exec();
  }

  create(userId: Types.ObjectId, tokenHash: string, expiresAt: Date) {
    return this.model.create({ userId, tokenHash, expiresAt });
  }

  /** Thu hồi token (logout / rotate). */
  revoke(tokenHash: string) {
    return this.model.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
}
