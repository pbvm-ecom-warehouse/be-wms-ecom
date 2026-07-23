import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserAddress, UserStatus } from '../schemas/user.schema';

export interface CreateUserInput {
  email: string;
  firebaseUid?: string;
  passwordHash: string;
  name?: string;
  phone?: string;
  type?: 'customer' | 'admin';
  emailVerified?: boolean;
}

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  findByEmail(email: string) {
    return this.model.findOne({ email }).select('_id').lean().exec();
  }

  findByFirebaseUid(firebaseUid: string) {
    return this.model.findOne({ firebaseUid, deletedAt: null }).exec();
  }

  linkFirebaseUid(id: string | Types.ObjectId, firebaseUid: string) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { firebaseUid } },
        { new: true },
      )
      .exec();
  }

  findActiveByEmail(email: string, includePasswordHash = false) {
    const q = this.model.findOne({
      email,
      deletedAt: null,
      status: UserStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  findActiveById(id: string | Types.ObjectId, includePasswordHash = false) {
    const q = this.model.findOne({
      _id: id,
      deletedAt: null,
      status: UserStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  create(data: CreateUserInput) {
    return this.model.create(data);
  }

  markEmailVerified(id: string | Types.ObjectId) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: UserStatus.ACTIVE },
        { $set: { emailVerified: true } },
        { new: true },
      )
      .exec();
  }

  updatePassword(id: string | Types.ObjectId, passwordHash: string) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: UserStatus.ACTIVE },
        { $set: { passwordHash } },
        { new: true },
      )
      .exec();
  }

  updateAvatar(id: string | Types.ObjectId, avatarUrl: string) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: UserStatus.ACTIVE },
        { $set: { avatarUrl } },
        { new: true },
      )
      .exec();
  }

  replaceAddresses(id: string | Types.ObjectId, addresses: UserAddress[]) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: UserStatus.ACTIVE },
        { $set: { addresses } },
        { new: true },
      )
      .exec();
  }
}
