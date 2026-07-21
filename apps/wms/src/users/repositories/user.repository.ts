import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { WmsRole } from '@app/auth';
import { Model, Types } from 'mongoose';
import { UserStatus, User, UserDocument } from '../schemas/user.schema';

export interface CreateUserInput {
  username: string;
  firebaseUid?: string;
  passwordHash: string;
  email?: string;
  name?: string;
  roles?: string[];
  mustChangePassword?: boolean;
  createdBy?: Types.ObjectId;
}

export interface FindAllUsersQuery {
  page: number;
  limit: number;
  role?: string;
  status?: UserStatus;
  warehouseId?: string;
  search?: string;
}

export interface UpdateUserProfileInput {
  name?: string;
  email?: string;
  warehouseId?: string;
}

const SOFT_DELETE_FILTER = { deletedAt: null } as const;

// Escape regex đặc biệt trước khi nhồi vào $regex — tránh lỗi compile pattern
// và ReDoS (catastrophic backtracking) từ input free-text của caller.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  findActiveByUsername(username: string, includePasswordHash = false) {
    const q = this.model.findOne({
      username,
      ...SOFT_DELETE_FILTER,
      status: UserStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  findActiveByEmail(email: string, includePasswordHash = false) {
    const q = this.model.findOne({
      email,
      ...SOFT_DELETE_FILTER,
      status: UserStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  findByFirebaseUid(firebaseUid: string, includePasswordHash = false) {
    const q = this.model.findOne({ firebaseUid, ...SOFT_DELETE_FILTER });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  linkFirebaseUid(id: string | Types.ObjectId, firebaseUid: string) {
    return this.model
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { $set: { firebaseUid } },
        { new: true },
      )
      .exec();
  }

  findActiveById(id: string | Types.ObjectId) {
    return this.model.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  findByIdWithPassword(id: string | Types.ObjectId) {
    return this.model
      .findOne({ _id: id, ...SOFT_DELETE_FILTER, status: UserStatus.ACTIVE })
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

  async findAll(
    query: FindAllUsersQuery,
  ): Promise<{ items: UserDocument[]; total: number }> {
    const filter: Record<string, unknown> = { ...SOFT_DELETE_FILTER };
    if (query.role) filter['roles'] = query.role;
    if (query.status) filter['status'] = query.status;
    if (query.warehouseId) filter['warehouseId'] = query.warehouseId;
    if (query.search) {
      const escapedSearch = escapeRegExp(query.search);
      filter['$or'] = [
        { username: { $regex: escapedSearch, $options: 'i' } },
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  updateRoles(
    id: string | Types.ObjectId,
    roles: string[],
    updatedBy: Types.ObjectId,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
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
        { _id: id, ...SOFT_DELETE_FILTER },
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
        { _id: id, ...SOFT_DELETE_FILTER, status: UserStatus.ACTIVE },
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

  updateProfile(
    id: string | Types.ObjectId,
    data: UpdateUserProfileInput,
    updatedBy: Types.ObjectId,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { $set: { ...data, updatedBy } },
        { new: true },
      )
      .exec();
  }

  async softDelete(
    id: string | Types.ObjectId,
    updatedBy: Types.ObjectId,
  ): Promise<boolean> {
    const res = await this.model
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { $set: { deletedAt: new Date(), updatedBy } },
      )
      .exec();
    return res.modifiedCount > 0;
  }
}
