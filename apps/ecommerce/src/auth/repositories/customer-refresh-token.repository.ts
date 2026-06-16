import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerRefreshToken } from '../schemas/customer-refresh-token.schema';

@Injectable()
export class CustomerRefreshTokenRepository {
  constructor(
    @InjectModel(CustomerRefreshToken.name)
    private readonly model: Model<CustomerRefreshToken>,
  ) {}

  findValid(tokenHash: string) {
    return this.model.findOne({ tokenHash, revokedAt: null }).exec();
  }

  create(customerId: Types.ObjectId, tokenHash: string, expiresAt: Date) {
    return this.model.create({ customerId, tokenHash, expiresAt });
  }

  revoke(tokenHash: string) {
    return this.model.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
}
