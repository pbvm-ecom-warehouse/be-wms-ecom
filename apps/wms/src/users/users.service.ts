import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { WmsRole } from '@app/auth';
import * as bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { UserRefreshTokenRepository } from '../auth/repositories/user-refresh-token.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UserRepository } from './repositories/user.repository';
import { UserStatus, UserDocument } from './schemas/user.schema';

const BCRYPT_ROUNDS = 12;

export interface Actor {
  sub: string;
  roles: string[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly refreshRepo: UserRefreshTokenRepository,
  ) {}

  private objectId(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new AppException('USER_NOT_FOUND');
    return new Types.ObjectId(id);
  }

  /**
   * MANAGER không được tạo/sửa tài khoản ADMIN (chống leo thang quyền).
   * ADMIN luôn qua được — hàm chỉ gọi khi actor KHÔNG có role ADMIN.
   */
  private assertManagerCanActOnTarget(
    actor: Actor,
    targetRolesBeforeAndAfter: string[],
  ): void {
    if (actor.roles.includes(WmsRole.ADMIN)) return;
    if (targetRolesBeforeAndAfter.includes(WmsRole.ADMIN)) {
      throw new AppException('USER_FORBIDDEN_ADMIN_TARGET');
    }
  }

  async list(
    query: QueryUsersDto,
  ): Promise<{ items: UserDocument[]; total: number }> {
    return this.userRepo.findAll({
      page: query.page,
      limit: query.limit,
      role: query.role,
      status: query.status,
      warehouseId: query.warehouseId,
      search: query.search,
    });
  }

  async getById(id: string): Promise<UserDocument> {
    const user = await this.userRepo.findActiveById(this.objectId(id));
    if (!user) throw new AppException('USER_NOT_FOUND');
    return user;
  }

  async create(dto: CreateUserDto, actor: Actor): Promise<UserDocument> {
    this.assertManagerCanActOnTarget(actor, dto.roles ?? []);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.userRepo.create({
      username: dto.username,
      email: dto.email,
      name: dto.name,
      roles: dto.roles ?? [],
      passwordHash,
      mustChangePassword: true,
      createdBy:
        actor.sub && Types.ObjectId.isValid(actor.sub)
          ? this.objectId(actor.sub)
          : undefined,
    });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: Actor,
  ): Promise<UserDocument> {
    const target = await this.getById(id);
    this.assertManagerCanActOnTarget(actor, target.roles);
    const updated = await this.userRepo.updateProfile(
      target._id,
      dto,
      this.objectId(actor.sub),
    );
    if (!updated) throw new AppException('USER_NOT_FOUND');
    return updated;
  }

  async updateRoles(
    id: string,
    roles: string[],
    actor: Actor,
  ): Promise<UserDocument> {
    const target = await this.getById(id);
    this.assertManagerCanActOnTarget(actor, [...target.roles, ...roles]);
    const updated = await this.userRepo.updateRoles(
      target._id,
      roles,
      this.objectId(actor.sub),
    );
    if (!updated) throw new AppException('USER_NOT_FOUND');
    return updated;
  }

  async lock(id: string, actor: Actor): Promise<UserDocument> {
    const target = await this.getById(id);
    this.assertManagerCanActOnTarget(actor, target.roles);
    const updated = await this.userRepo.updateStatus(
      target._id,
      UserStatus.LOCKED,
      this.objectId(actor.sub),
    );
    if (!updated) throw new AppException('USER_NOT_FOUND');
    await this.refreshRepo.revokeAllForUser(updated._id);
    return updated;
  }

  async unlock(id: string, actor: Actor): Promise<UserDocument> {
    const target = await this.getById(id);
    this.assertManagerCanActOnTarget(actor, target.roles);
    const updated = await this.userRepo.updateStatus(
      target._id,
      UserStatus.ACTIVE,
      this.objectId(actor.sub),
    );
    if (!updated) throw new AppException('USER_NOT_FOUND');
    return updated;
  }

  async resetPassword(
    id: string,
    temporaryPassword: string,
    actor: Actor,
  ): Promise<{ success: true; mustChangePassword: true }> {
    const target = await this.getById(id);
    this.assertManagerCanActOnTarget(actor, target.roles);
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    const updated = await this.userRepo.updatePassword(
      target._id,
      passwordHash,
      true,
      this.objectId(actor.sub),
    );
    if (!updated) throw new AppException('USER_NOT_FOUND');
    await this.refreshRepo.revokeAllForUser(updated._id);
    return { success: true, mustChangePassword: true };
  }

  async remove(id: string, actor: Actor): Promise<void> {
    if (id === actor.sub) {
      throw new AppException('USER_CANNOT_DELETE_SELF');
    }
    const target = await this.getById(id);
    this.assertManagerCanActOnTarget(actor, target.roles);
    const deleted = await this.userRepo.softDelete(
      target._id,
      this.objectId(actor.sub),
    );
    if (!deleted) throw new AppException('USER_NOT_FOUND');
  }
}
