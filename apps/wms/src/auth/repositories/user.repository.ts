import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { WmsRole } from '@app/auth';
import { Model, Types } from 'mongoose';
import { UserStatus, User } from '../schemas/user.schema';

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  name?: string;
  roles?: string[];
  createdBy?: Types.ObjectId;
}

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name) private readonly model: Model<User>,
  ) {}

  /** Tìm nhân viên đang hoạt động theo username. Mặc định không kèm passwordHash. */
  findActiveByUsername(username: string, includePasswordHash = false) {
    const q = this.model.findOne({
      username,
      deletedAt: null,
      status: UserStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  findActiveById(id: string | Types.ObjectId) {
    return this.model
      .findOne({ _id: id, deletedAt: null })
      .exec();
  }

  /** Dùng cho bootstrapAdmin — kiểm tra DB có nhân viên nào chưa. */
  countAll() {
    return this.model.estimatedDocumentCount().exec();
  }

  create(data: CreateUserInput) {
    return this.model.create({
      ...data,
      roles: data.roles ?? [WmsRole.RECEIVER],
    });
  }
}
