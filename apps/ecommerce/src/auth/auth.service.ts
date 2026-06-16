import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { JwtPayload } from '@app/auth';
import { durationToMs, generateOpaqueToken, hashToken } from '@app/common';
import { EVENTS, QUEUES, type CustomerEmailActionPayload } from '@app/events';
import * as bcrypt from 'bcryptjs';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { authConfig } from '../config/auth.config';
import { RegisterDto } from './dto/auth.dto';
import { AuthTokenType } from './schemas/customer-auth-token.schema';
import { CustomerAuthTokenRepository } from './repositories/customer-auth-token.repository';
import { CustomerRefreshTokenRepository } from './repositories/customer-refresh-token.repository';
import { CustomerRepository } from './repositories/customer.repository';

type MsDuration = Exclude<JwtSignOptions['expiresIn'], number | undefined>;

const BCRYPT_ROUNDS = 12;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Auth khách Ecommerce: register/login, access JWT (dài) + refresh token (rotate).
 * Khi đăng ký, phát event customer.verify_requested sang Notification (producer mẫu
 * Ecom→Notification) — KHÔNG tự gửi email, để app notification lo.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly refreshRepo: CustomerRefreshTokenRepository,
    private readonly authTokenRepo: CustomerAuthTokenRepository,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notifyQueue: Queue,
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.customerRepo.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email đã được đăng ký');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const customer = await this.customerRepo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
    });

    await this.sendVerifyEmail(customer._id, customer.email);
    const tokens = await this.issueTokens(customer._id, customer.email);
    return { ...tokens, emailVerified: false };
  }

  /** Sinh token xác minh email (lưu hash) và phát event sang Notification. */
  private async sendVerifyEmail(customerId: Types.ObjectId, email: string) {
    const token = generateOpaqueToken();
    await this.authTokenRepo.create(
      customerId,
      AuthTokenType.VERIFY_EMAIL,
      hashToken(token),
      new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    );
    const payload: CustomerEmailActionPayload = {
      customerId: customerId.toString(),
      email,
      token, // token gốc — chỉ đi qua kênh notification, DB chỉ giữ hash
    };
    await this.notifyQueue.add(EVENTS.CUSTOMER_VERIFY_REQUESTED, payload);
  }

  async login(email: string, password: string) {
    const customer = await this.customerRepo.findActiveByEmail(email, true);
    const ok = customer
      ? await bcrypt.compare(password, customer.passwordHash)
      : await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidin');
    if (!customer || !ok) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }
    const tokens = await this.issueTokens(customer._id, customer.email);
    return { ...tokens, emailVerified: customer.emailVerified };
  }

  private async issueTokens(customerId: Types.ObjectId, email: string) {
    const payload: JwtPayload = {
      sub: customerId.toString(),
      type: 'customer',
      email,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.auth.jwtSecret,
      expiresIn: this.auth.jwtExpiresIn as MsDuration,
    });

    const refreshToken = generateOpaqueToken();
    const ttl = durationToMs(this.auth.refreshExpiresIn);
    await this.refreshRepo.create(
      customerId,
      hashToken(refreshToken),
      new Date(Date.now() + ttl),
    );

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    const doc = await this.refreshRepo.findValid(hashToken(refreshToken));
    if (!doc || doc.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }
    const customer = await this.customerRepo.findActiveById(
      doc.customerId.toString(),
    );
    if (!customer)
      throw new UnauthorizedException('Tài khoản không còn hiệu lực');

    doc.revokedAt = new Date();
    await doc.save();
    return this.issueTokens(customer._id, customer.email);
  }

  async logout(refreshToken: string) {
    await this.refreshRepo.revoke(hashToken(refreshToken));
    return { success: true };
  }

  async me(customerId: string) {
    const customer = await this.customerRepo.findActiveById(customerId);
    if (!customer) throw new UnauthorizedException();
    return customer;
  }
}
