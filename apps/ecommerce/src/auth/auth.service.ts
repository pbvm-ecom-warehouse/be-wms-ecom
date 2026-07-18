import { randomInt } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { JwtPayload } from '@app/auth';
import {
  durationToMs,
  generateOpaqueToken,
  hashToken,
  FirebaseAdminService,
} from '@app/common';
import { EVENTS, QUEUES, type CustomerEmailActionPayload } from '@app/events';
import * as bcrypt from 'bcryptjs';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { authConfig } from '../config/auth.config';
import {
  AddressDto,
  ChangePasswordDto,
  RegisterDto,
  CreateEcomManagerDto,
  UpdateAddressDto,
} from './dto/auth.dto';
import { EcomRole } from '@app/auth';
import { UserAddress, UserDocument } from './schemas/user.schema';
import { UserRefreshTokenRepository } from './repositories/user-refresh-token.repository';
import { UserRepository } from './repositories/user.repository';
import { OtpStore, type OtpType } from './otp.store';

type MsDuration = Exclude<JwtSignOptions['expiresIn'], number | undefined>;

const BCRYPT_ROUNDS = 12;
const INVALID_BCRYPT_HASH = '$2a$12$invalidinvalidinvalidinvalidin';
const NEUTRAL_RESET_MESSAGE =
  'Neu email ton tai, chung toi da gui huong dan dat lai mat khau';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly refreshRepo: UserRefreshTokenRepository,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notifyQueue: Queue,
    private readonly jwt: JwtService,
    private readonly firebaseAdmin: FirebaseAdminService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
    private readonly otpStore: OtpStore,
  ) {}

  private objectId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new AppException('NOT_FOUND', 'User not found');
    return new Types.ObjectId(id);
  }

  async register(dto: RegisterDto) {
    const exists = await this.userRepo.findByEmail(dto.email);
    if (exists) throw new AppException('AUTH_EMAIL_CONFLICT');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.userRepo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
      type: 'customer',
      roles: ['customer'],
    });

    await this.sendEmailAction(
      user._id,
      user.email,
      'verify_email',
      EVENTS.CUSTOMER_VERIFY_REQUESTED,
    );
    const tokens = await this.issueTokens(user);
    return { ...tokens, emailVerified: false };
  }

  async createEcomManager(dto: CreateEcomManagerDto) {
    const exists = await this.userRepo.findByEmail(dto.email);
    if (exists) throw new AppException('AUTH_EMAIL_CONFLICT');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.userRepo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
      type: 'admin',
      roles: [EcomRole.ECOM_MANAGER],
      emailVerified: true,
    });
    return user;
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async sendEmailAction(
    customerId: Types.ObjectId,
    email: string,
    type: OtpType,
    eventName:
      | typeof EVENTS.CUSTOMER_VERIFY_REQUESTED
      | typeof EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED,
  ) {
    const code = this.generateOtp();
    await this.otpStore.issue(customerId.toString(), type, code);
    const payload: CustomerEmailActionPayload = {
      customerId: customerId.toString(),
      email,
      code,
    };
    // removeOnComplete: xóa mã plaintext khỏi job data (Redis) sau khi gửi xong.
    await this.notifyQueue.add(eventName, payload, { removeOnComplete: true });
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findActiveByEmail(email, true);
    const ok = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, INVALID_BCRYPT_HASH);
    if (!user || !ok) {
      throw new AppException(
        'AUTH_INVALID_CREDENTIALS',
        'Sai email hoặc mật khẩu',
      );
    }
    const tokens = await this.issueTokens(user);
    return { ...tokens, emailVerified: user.emailVerified };
  }

  async googleLogin(idToken: string) {
    const decoded = await this.firebaseAdmin.verifyIdToken(idToken);
    if (!decoded.email) {
      throw new AppException('AUTH_FIREBASE_NO_EMAIL');
    }

    const existingByUid = await this.userRepo.findByFirebaseUid(decoded.uid);
    const existingByEmail = existingByUid
      ? existingByUid
      : await this.userRepo.findActiveByEmail(decoded.email, true);

    const user = existingByEmail
      ? existingByEmail.firebaseUid
        ? existingByEmail.firebaseUid === decoded.uid
          ? existingByEmail
          : (() => {
              throw new AppException('AUTH_FIREBASE_UID_MISMATCH');
            })()
        : await this.userRepo.linkFirebaseUid(existingByEmail._id, decoded.uid)
      : await (async () => {
          const email = decoded.email!;
          const rawPassword = generateOpaqueToken().slice(0, 12);
          const hash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
          const newUser = await this.userRepo.create({
            email,
            firebaseUid: decoded.uid,
            passwordHash: hash,
            name: typeof decoded.name === 'string' ? decoded.name : undefined,
            phone: decoded.phone_number ?? undefined,
            type: 'customer',
            roles: ['customer'],
          });
          await this.notifyQueue.add(
            EVENTS.CUSTOMER_GOOGLE_REGISTERED,
            {
              customerId: newUser._id.toString(),
              email: newUser.email,
              password: rawPassword,
            },
            { removeOnComplete: true },
          );
          return newUser;
        })();

    if (!user) {
      throw new AppException('AUTH_FIREBASE_LOGIN_FAILED');
    }

    if (!user.emailVerified) {
      await this.userRepo.markEmailVerified(user._id);
    }

    const tokens = await this.issueTokens(user);
    return { ...tokens, emailVerified: true };
  }

  private async issueTokens(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      type: user.type,
      email: user.email,
      roles: user.roles,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.auth.jwtSecret,
      expiresIn: this.auth.jwtExpiresIn as MsDuration,
    });

    const refreshToken = generateOpaqueToken();
    const ttl = durationToMs(this.auth.refreshExpiresIn);
    await this.refreshRepo.create(
      user._id,
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
    if (!user) throw new AppException('AUTH_ACCOUNT_INACTIVE');

    doc.revokedAt = new Date();
    await doc.save();
    return this.issueTokens(user);
  }

  async logout(refreshToken: string) {
    await this.refreshRepo.revoke(hashToken(refreshToken));
    return { success: true };
  }

  async me(customerId: string) {
    const user = await this.userRepo.findActiveById(customerId);
    if (!user) throw new AppException('UNAUTHENTICATED');
    return user;
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.userRepo.findActiveByEmail(email);
    const ok = user
      ? await this.otpStore.verify(user._id.toString(), 'verify_email', code)
      : false;
    if (!user || !ok) {
      throw new AppException('AUTH_OTP_INVALID');
    }
    await this.userRepo.markEmailVerified(user._id);
    return { success: true, emailVerified: true };
  }

  async resendVerifyEmail(customerId: string) {
    const user = await this.userRepo.findActiveById(this.objectId(customerId));
    if (!user) throw new AppException('UNAUTHENTICATED');
    if (user.emailVerified) return { success: true, emailVerified: true };

    await this.sendEmailAction(
      user._id,
      user.email,
      'verify_email',
      EVENTS.CUSTOMER_VERIFY_REQUESTED,
    );
    return { success: true, emailVerified: false };
  }

  async forgotPassword(email: string) {
    const user = await this.userRepo.findActiveByEmail(email);
    if (user) {
      await this.sendEmailAction(
        user._id,
        user.email,
        'reset_password',
        EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED,
      );
    }
    return { message: NEUTRAL_RESET_MESSAGE };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.userRepo.findActiveByEmail(email);
    const ok = user
      ? await this.otpStore.verify(user._id.toString(), 'reset_password', code)
      : false;
    if (!user || !ok) {
      throw new AppException('AUTH_OTP_INVALID');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.userRepo.updatePassword(user._id, passwordHash);
    await this.refreshRepo.revokeAllForUser(user._id);
    return { success: true };
  }

  async changePassword(customerId: string, dto: ChangePasswordDto) {
    const user = await this.userRepo.findActiveById(
      this.objectId(customerId),
      true,
    );
    const ok = user
      ? await bcrypt.compare(dto.oldPassword, user.passwordHash)
      : await bcrypt.compare(dto.oldPassword, INVALID_BCRYPT_HASH);
    if (!user || !ok)
      throw new AppException(
        'AUTH_INVALID_CREDENTIALS',
        'Mật khẩu cũ không đúng',
      );

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.userRepo.updatePassword(user._id, passwordHash);
    return { success: true };
  }

  async listAddresses(customerId: string) {
    const user = await this.userRepo.findActiveById(this.objectId(customerId));
    if (!user) throw new AppException('UNAUTHENTICATED');
    return user.addresses ?? [];
  }

  async addAddress(customerId: string, dto: AddressDto) {
    const user = await this.userRepo.findActiveById(this.objectId(customerId));
    if (!user) throw new AppException('UNAUTHENTICATED');

    const addresses = this.normalizeAddresses(user.addresses ?? []);
    const shouldDefault = dto.isDefault === true || addresses.length === 0;
    const next = [
      ...addresses.map((address) => ({
        ...address,
        isDefault: shouldDefault ? false : address.isDefault,
      })),
      { _id: new Types.ObjectId(), ...dto, isDefault: shouldDefault },
    ];
    return this.saveAddresses(user._id, next);
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    const user = await this.userRepo.findActiveById(this.objectId(customerId));
    if (!user) throw new AppException('UNAUTHENTICATED');

    const addresses = this.normalizeAddresses(user.addresses ?? []);
    const exists = addresses.some(
      (address) => address._id?.toString() === addressId,
    );
    if (!exists) throw new AppException('NOT_FOUND', 'Địa chỉ không tồn tại');

    const next = addresses.map((address) => {
      if (address._id?.toString() !== addressId) {
        return dto.isDefault === true
          ? { ...address, isDefault: false }
          : address;
      }
      return {
        ...address,
        ...dto,
        isDefault: dto.isDefault ?? address.isDefault,
      };
    });
    return this.saveAddresses(user._id, this.ensureOneDefault(next));
  }

  async deleteAddress(customerId: string, addressId: string) {
    const user = await this.userRepo.findActiveById(this.objectId(customerId));
    if (!user) throw new AppException('UNAUTHENTICATED');

    const addresses = this.normalizeAddresses(user.addresses ?? []);
    const next = addresses.filter(
      (address) => address._id?.toString() !== addressId,
    );
    if (next.length === addresses.length)
      throw new AppException('NOT_FOUND', 'Địa chỉ không tồn tại');
    return this.saveAddresses(user._id, this.ensureOneDefault(next));
  }

  async setDefaultAddress(customerId: string, addressId: string) {
    const user = await this.userRepo.findActiveById(this.objectId(customerId));
    if (!user) throw new AppException('UNAUTHENTICATED');

    const addresses = this.normalizeAddresses(user.addresses ?? []);
    const exists = addresses.some(
      (address) => address._id?.toString() === addressId,
    );
    if (!exists) throw new AppException('NOT_FOUND', 'Địa chỉ không tồn tại');

    const next = addresses.map((address) => ({
      ...address,
      isDefault: address._id?.toString() === addressId,
    }));
    return this.saveAddresses(user._id, next);
  }

  private normalizeAddresses(addresses: UserAddress[]) {
    return addresses.map((address) => {
      const doc = address as UserAddress & {
        toObject?: () => UserAddress;
      };
      const plain =
        typeof doc.toObject === 'function' ? doc.toObject() : address;
      return { ...plain };
    });
  }

  private ensureOneDefault(addresses: UserAddress[]) {
    if (addresses.length === 0) return addresses;
    if (!addresses.some((address) => address.isDefault)) {
      return addresses.map((address, index) => ({
        ...address,
        isDefault: index === 0,
      }));
    }
    let defaultSeen = false;
    return addresses.map((address) => {
      if (!address.isDefault) return address;
      if (defaultSeen) return { ...address, isDefault: false };
      defaultSeen = true;
      return address;
    });
  }

  private async saveAddresses(
    userId: Types.ObjectId,
    addresses: UserAddress[],
  ) {
    const user = await this.userRepo.replaceAddresses(
      userId,
      this.ensureOneDefault(addresses),
    );
    if (!user) throw new AppException('UNAUTHENTICATED');
    return user.addresses;
  }
}
