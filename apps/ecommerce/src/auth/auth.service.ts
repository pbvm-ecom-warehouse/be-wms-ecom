import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { JwtPayload } from '@app/auth';
import { durationToMs, generateOpaqueToken, hashToken } from '@app/common';
import { EVENTS, QUEUES, type CustomerEmailActionPayload } from '@app/events';
import * as bcrypt from 'bcryptjs';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { Env } from '../config/env.validation';
import { RegisterDto } from './dto/auth.dto';
import { Customer, CustomerStatus } from './schemas/customer.schema';
import {
  AuthTokenType,
  CustomerAuthToken,
} from './schemas/customer-auth-token.schema';
import { CustomerRefreshToken } from './schemas/customer-refresh-token.schema';

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
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(CustomerRefreshToken.name)
    private readonly refreshModel: Model<CustomerRefreshToken>,
    @InjectModel(CustomerAuthToken.name)
    private readonly authTokenModel: Model<CustomerAuthToken>,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notifyQueue: Queue,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.customerModel
      .findOne({ email: dto.email })
      .select('_id')
      .lean()
      .exec();
    if (exists) throw new ConflictException('Email đã được đăng ký');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const customer = await this.customerModel.create({
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
    await this.authTokenModel.create({
      customerId,
      type: AuthTokenType.VERIFY_EMAIL,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    });
    const payload: CustomerEmailActionPayload = {
      customerId: customerId.toString(),
      email,
      token, // token gốc — chỉ đi qua kênh notification, DB chỉ giữ hash
    };
    await this.notifyQueue.add(EVENTS.CUSTOMER_VERIFY_REQUESTED, payload);
  }

  private async validateCustomer(email: string, password: string) {
    const customer = await this.customerModel
      .findOne({ email, deletedAt: null, status: CustomerStatus.ACTIVE })
      .select('+passwordHash')
      .exec();
    const ok = customer
      ? await bcrypt.compare(password, customer.passwordHash)
      : await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidin');
    if (!customer || !ok) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }
    return customer;
  }

  async login(email: string, password: string) {
    const customer = await this.validateCustomer(email, password);
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
      secret: this.config.get('ECOM_JWT_SECRET', { infer: true }),
      expiresIn: this.config.get('ECOM_JWT_EXPIRES_IN', { infer: true }),
    });

    const refreshToken = generateOpaqueToken();
    const ttl = durationToMs(
      this.config.get('ECOM_REFRESH_EXPIRES_IN', { infer: true }),
    );
    await this.refreshModel.create({
      customerId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ttl),
    });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    const doc = await this.refreshModel
      .findOne({ tokenHash: hashToken(refreshToken), revokedAt: null })
      .exec();
    if (!doc || doc.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }
    const customer = await this.customerModel
      .findOne({
        _id: doc.customerId,
        deletedAt: null,
        status: CustomerStatus.ACTIVE,
      })
      .exec();
    if (!customer)
      throw new UnauthorizedException('Tài khoản không còn hiệu lực');

    doc.revokedAt = new Date();
    await doc.save();
    return this.issueTokens(customer._id, customer.email);
  }

  async logout(refreshToken: string) {
    await this.refreshModel.updateOne(
      { tokenHash: hashToken(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return { success: true };
  }

  async me(customerId: string) {
    const customer = await this.customerModel
      .findOne({ _id: customerId, deletedAt: null })
      .exec();
    if (!customer) throw new UnauthorizedException();
    return customer;
  }
}
