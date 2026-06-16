import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AuthTokenType,
  CustomerAuthToken,
} from '../schemas/customer-auth-token.schema';

@Injectable()
export class CustomerAuthTokenRepository {
  constructor(
    @InjectModel(CustomerAuthToken.name)
    private readonly model: Model<CustomerAuthToken>,
  ) {}

  create(
    customerId: Types.ObjectId,
    type: AuthTokenType,
    tokenHash: string,
    expiresAt: Date,
  ) {
    return this.model.create({ customerId, type, tokenHash, expiresAt });
  }
}
