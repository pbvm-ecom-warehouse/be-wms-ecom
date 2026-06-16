import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { JwtPayload, WmsRole } from '@app/auth';
import { durationToMs, generateOpaqueToken, hashToken } from '@app/common';
import * as bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { authConfig } from '../config/auth.config';
import { CreateUserDto } from './dto/auth.dto';
import { UserRefreshTokenRepository } from './repositories/user-refresh-token.repository';
import { UserRepository } from './repositories/user.repository';

type MsDuration = Exclude<JwtSignOptions['expiresIn'], number | undefined>;

const BCRYPT_ROUNDS = 12;

/**
 * Auth nhân viên WMS: login bằng username/password, cấp access JWT (ngắn) +
 * refresh token (dài, lưu HASH trong DB, rotate khi refresh). Secret RIÊNG của WMS.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly refreshRepo: UserRefreshTokenRepository,
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  /** Xác thực username/password → trả document user (đã loại tài khoản khóa/xóa). */
  private async validateUser(username: string, password: string) {
    const user = await this.userRepo.findActiveByUsername(username, true);
    // So sánh kể cả khi không tìm thấy user để tránh lộ thời gian (timing attack nhẹ).
    const ok = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidin');
    if (!user || !ok) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }
    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    const tokens = await this.issueTokens(user._id, user.roles, user.username);
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  /** Cấp cặp access + refresh token; lưu hash refresh vào DB. */
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

  /** Đổi access token mới + xoay refresh token (revoke cái cũ). */
  async refresh(refreshToken: string) {
    const doc = await this.refreshRepo.findValid(hashToken(refreshToken));
    if (!doc || doc.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }
    const user = await this.userRepo.findActiveById(doc.userId);
    if (!user) throw new UnauthorizedException('Tài khoản không còn hiệu lực');

    doc.revokedAt = new Date(); // xoay: token cũ hết dùng được
    await doc.save();
    return this.issueTokens(user._id, user.roles, user.username);
  }

  /** Đăng xuất: thu hồi refresh token đang giữ. */
  async logout(refreshToken: string) {
    await this.refreshRepo.revoke(hashToken(refreshToken));
    return { success: true };
  }

  /** Thông tin nhân viên hiện tại (không kèm passwordHash). */
  async me(userId: string) {
    const user = await this.userRepo.findActiveById(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /**
   * Khởi tạo ADMIN đầu tiên — CHỈ chạy được khi DB chưa có user nào (chống chiếm quyền).
   * Sau khi có admin, hãy dùng createUser (đã bảo vệ bằng @Roles(ADMIN)).
   */
  async bootstrapAdmin(dto: CreateUserDto) {
    const count = await this.userRepo.countAll();
    if (count > 0) {
      throw new ForbiddenException(
        'Đã có nhân viên trong hệ thống — dùng endpoint tạo user (ADMIN).',
      );
    }
    return this.createUser({ ...dto, roles: [WmsRole.ADMIN] });
  }

  /** Tạo nhân viên mới (gọi bởi ADMIN). */
  async createUser(dto: CreateUserDto, createdBy?: string) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.userRepo.create({
      username: dto.username,
      name: dto.name,
      roles: dto.roles ?? [],
      passwordHash,
      createdBy: createdBy ? new Types.ObjectId(createdBy) : undefined,
    });
    // Không trả passwordHash (select:false vẫn loại, nhưng trả về object gọn).
    return { id: user._id, username: user.username, roles: user.roles };
  }
}
