import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { JwtPayload, WmsRole } from '@app/auth';
import {
  AppException,
  durationToMs,
  generateOpaqueToken,
  hashToken,
  FirebaseAdminService,
} from '@app/common';
import * as bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { authConfig } from '../config/auth.config';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserRepository } from '../users/repositories/user.repository';
import { UserStatus } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/auth.dto';
import { UserRefreshTokenRepository } from './repositories/user-refresh-token.repository';

type MsDuration = Exclude<JwtSignOptions['expiresIn'], number | undefined>;

const BCRYPT_ROUNDS = 12;
const INVALID_BCRYPT_HASH = '$2a$12$invalidinvalidinvalidinvalidin';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly usersService: UsersService,
    private readonly refreshRepo: UserRefreshTokenRepository,
    private readonly jwt: JwtService,
    private readonly firebaseAdmin: FirebaseAdminService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  private objectId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new AppException('NOT_FOUND', 'User not found');
    return new Types.ObjectId(id);
  }

  private async validateUser(username: string, password: string) {
    const user = await this.userRepo.findActiveByUsername(username, true);
    const ok = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, INVALID_BCRYPT_HASH);
    if (!user || !ok) {
      throw new AppException(
        'AUTH_INVALID_CREDENTIALS',
        'Sai tài khoản hoặc mật khẩu',
      );
    }
    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    const tokens = await this.issueTokens(user._id, user.roles, user.username);
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  async googleLogin(idToken: string) {
    const decoded = await this.firebaseAdmin.verifyIdToken(idToken);
    if (!decoded.email) {
      throw new AppException('AUTH_FIREBASE_NO_EMAIL');
    }

    const existingByUid = await this.userRepo.findByFirebaseUid(
      decoded.uid,
      true,
    );
    const existingByEmail = existingByUid
      ? existingByUid
      : await this.userRepo.findActiveByEmail(decoded.email, true);

    if (!existingByEmail) {
      throw new AppException('AUTH_WMS_NOT_INITIALIZED');
    }

    const user = existingByEmail.firebaseUid
      ? existingByEmail.firebaseUid === decoded.uid
        ? existingByEmail
        : (() => {
            throw new AppException('AUTH_FIREBASE_UID_MISMATCH');
          })()
      : await this.userRepo.linkFirebaseUid(existingByEmail._id, decoded.uid);

    if (!user) {
      throw new AppException('AUTH_WMS_NOT_INITIALIZED');
    }

    const tokens = await this.issueTokens(user._id, user.roles, user.username);
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  private async issueTokens(
    userId: Types.ObjectId,
    roles: string[],
    username: string,
  ) {
    const payload: JwtPayload = {
      sub: userId.toString(),
      type: 'user',
      roles,
      username,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.auth.jwtSecret,
      expiresIn: this.auth.jwtExpiresIn as MsDuration,
    });

    const refreshToken = generateOpaqueToken();
    const ttl = durationToMs(this.auth.refreshExpiresIn);
    await this.refreshRepo.create(
      userId,
      hashToken(refreshToken),
      new Date(Date.now() + ttl),
    );

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    const doc = await this.refreshRepo.findValid(hashToken(refreshToken));
    if (!doc || doc.expiresAt.getTime() < Date.now()) {
      throw new AppException('AUTH_TOKEN_INVALID');
    }
    const user = await this.userRepo.findActiveById(doc.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppException('AUTH_ACCOUNT_INACTIVE');
    }

    doc.revokedAt = new Date();
    await doc.save();
    return this.issueTokens(user._id, user.roles, user.username);
  }

  async logout(refreshToken: string) {
    await this.refreshRepo.revoke(hashToken(refreshToken));
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.userRepo.findActiveById(userId);
    if (!user || user.status !== UserStatus.ACTIVE)
      throw new AppException('UNAUTHENTICATED');
    return user;
  }

  async bootstrapAdmin(dto: CreateUserDto) {
    const count = await this.userRepo.countAll();
    if (count > 0) {
      throw new AppException('AUTH_BOOTSTRAP_FORBIDDEN');
    }
    return this.usersService.create(
      { ...dto, roles: [WmsRole.ADMIN] },
      { sub: '', roles: [WmsRole.ADMIN] },
    );
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepo.findByIdWithPassword(
      this.objectId(userId),
    );
    const ok = user
      ? await bcrypt.compare(dto.oldPassword, user.passwordHash)
      : await bcrypt.compare(dto.oldPassword, INVALID_BCRYPT_HASH);
    if (!user || !ok) {
      throw new AppException(
        'AUTH_INVALID_CREDENTIALS',
        'Mật khẩu cũ không đúng',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.userRepo.updatePassword(user._id, passwordHash, false, user._id);
    return { success: true, mustChangePassword: false };
  }
}
