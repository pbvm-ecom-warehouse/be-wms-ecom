import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Customer,
  CustomerAddress,
  CustomerStatus,
} from '../schemas/customer.schema';

export interface CreateCustomerInput {
  email: string;
  passwordHash: string;
  name?: string;
  phone?: string;
}

@Injectable()
export class CustomerRepository {
  constructor(@InjectModel(Customer.name) private readonly model: Model<Customer>) {}

  findByEmail(email: string) {
    return this.model.findOne({ email }).select('_id').lean().exec();
  }

  findActiveByEmail(email: string, includePasswordHash = false) {
    const q = this.model.findOne({
      email,
      deletedAt: null,
      status: CustomerStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  findActiveById(id: string | Types.ObjectId, includePasswordHash = false) {
    const q = this.model.findOne({
      _id: id,
      deletedAt: null,
      status: CustomerStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  create(data: CreateCustomerInput) {
    return this.model.create(data);
  }

  markEmailVerified(id: string | Types.ObjectId) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: CustomerStatus.ACTIVE },
        { $set: { emailVerified: true } },
        { new: true },
      )
      .exec();
  }

  updatePassword(id: string | Types.ObjectId, passwordHash: string) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: CustomerStatus.ACTIVE },
        { $set: { passwordHash } },
        { new: true },
      )
      .exec();
  }

  replaceAddresses(id: string | Types.ObjectId, addresses: CustomerAddress[]) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: CustomerStatus.ACTIVE },
        { $set: { addresses } },
        { new: true },
      )
      .exec();
  }
}
