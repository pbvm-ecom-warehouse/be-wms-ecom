import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { JwtPayload, WmsRole } from '@app/auth';
import { durationToMs, generateOpaqueToken, hashToken } from '@app/common';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { Env } from '../config/env.validation';
import { CreateUserDto } from './dto/auth.dto';
import { UserStatus, User } from './schemas/user.schema';
import { UserRefreshToken } from './schemas/user-refresh-token.schema';

const BCRYPT_ROUNDS = 12;

/**
 * Auth nhân viên WMS: login bằng username/password, cấp access JWT (ngắn) +
 * refresh token (dài, lưu HASH trong DB, rotate khi refresh). Secret RIÊNG của WMS.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(UserRefreshToken.name)
    private readonly refreshModel: Model<UserRefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Xác thực username/password → trả document user (đã loại tài khoản khóa/xóa). */
  private async validateUser(username: string, password: string) {
    const user = await this.userModel
      .findOne({ username, deletedAt: null, status: UserStatus.ACTIVE })
      .select('+passwordHash')
      .exec();
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
      secret: this.config.get('WMS_JWT_SECRET', { infer: true }),
      expiresIn: this.config.get('WMS_JWT_EXPIRES_IN', { infer: true }),
    });

    const refreshToken = generateOpaqueToken();
    const ttl = durationToMs(
      this.config.get('WMS_REFRESH_EXPIRES_IN', { infer: true }),
    );
    await this.refreshModel.create({
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ttl),
    });

    return { accessToken, refreshToken };
  }

  /** Đổi access token mới + xoay refresh token (revoke cái cũ). */
  async refresh(refreshToken: string) {
    const doc = await this.refreshModel
      .findOne({ tokenHash: hashToken(refreshToken), revokedAt: null })
      .exec();
    if (!doc || doc.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }
    const user = await this.userModel
      .findOne({ _id: doc.userId, deletedAt: null, status: UserStatus.ACTIVE })
      .exec();
    if (!user) throw new UnauthorizedException('Tài khoản không còn hiệu lực');

    doc.revokedAt = new Date(); // xoay: token cũ hết dùng được
    await doc.save();
    return this.issueTokens(user._id, user.roles, user.username);
  }

  /** Đăng xuất: thu hồi refresh token đang giữ. */
  async logout(refreshToken: string) {
    await this.refreshModel.updateOne(
      { tokenHash: hashToken(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return { success: true };
  }

  /** Thông tin nhân viên hiện tại (không kèm passwordHash). */
  async me(userId: string) {
    const user = await this.userModel
      .findOne({ _id: userId, deletedAt: null })
      .exec();
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /**
   * Khởi tạo ADMIN đầu tiên — CHỈ chạy được khi DB chưa có user nào (chống chiếm quyền).
   * Sau khi có admin, hãy dùng createUser (đã bảo vệ bằng @Roles(ADMIN)).
   */
  async bootstrapAdmin(dto: CreateUserDto) {
    const count = await this.userModel.estimatedDocumentCount().exec();
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
    const user = await this.userModel.create({
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
