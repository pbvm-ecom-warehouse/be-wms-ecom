import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { WmsRole } from '@app/auth';
import { Model, Types } from 'mongoose';
import { UserStatus, User } from '../schemas/user.schema';

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  email?: string;
  name?: string;
  roles?: string[];
  mustChangePassword?: boolean;
  createdBy?: Types.ObjectId;
}

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  findActiveByUsername(username: string, includePasswordHash = false) {
    const q = this.model.findOne({
      username,
      deletedAt: null,
      status: UserStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  findActiveById(id: string | Types.ObjectId) {
    return this.model.findOne({ _id: id, deletedAt: null }).exec();
  }

  findByIdWithPassword(id: string | Types.ObjectId) {
    return this.model
      .findOne({ _id: id, deletedAt: null, status: UserStatus.ACTIVE })
      .select('+passwordHash')
      .exec();
  }

  countAll() {
    return this.model.estimatedDocumentCount().exec();
  }

  create(data: CreateUserInput) {
    return this.model.create({
      ...data,
      roles: data.roles ?? [WmsRole.RECEIVER],
    });
  }

  updateRoles(id: string | Types.ObjectId, roles: string[], updatedBy: Types.ObjectId) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { roles, updatedBy } },
        { new: true },
      )
      .exec();
  }

  updateStatus(
    id: string | Types.ObjectId,
    status: UserStatus,
    updatedBy: Types.ObjectId,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { status, updatedBy } },
        { new: true },
      )
      .exec();
  }

  updatePassword(
    id: string | Types.ObjectId,
    passwordHash: string,
    mustChangePassword: boolean,
    updatedBy?: Types.ObjectId,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: UserStatus.ACTIVE },
        {
          $set: {
            passwordHash,
            mustChangePassword,
            ...(updatedBy ? { updatedBy } : {}),
          },
        },
        { new: true },
      )
      .exec();
  }
}
