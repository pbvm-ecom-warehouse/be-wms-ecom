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
  UpdateAddressDto,
} from './dto/auth.dto';
import { CustomerAddress } from './schemas/customer.schema';
import { CustomerRefreshTokenRepository } from './repositories/customer-refresh-token.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { OtpStore, type OtpType } from './otp.store';

type MsDuration = Exclude<JwtSignOptions['expiresIn'], number | undefined>;

const BCRYPT_ROUNDS = 12;
const INVALID_BCRYPT_HASH = '$2a$12$invalidinvalidinvalidinvalidin';
const NEUTRAL_RESET_MESSAGE =
  'Neu email ton tai, chung toi da gui huong dan dat lai mat khau';

@Injectable()
export class AuthService {
  constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly refreshRepo: CustomerRefreshTokenRepository,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notifyQueue: Queue,
    private readonly jwt: JwtService,
    private readonly firebaseAdmin: FirebaseAdminService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
    private readonly otpStore: OtpStore,
  ) {}

  private objectId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new AppException('NOT_FOUND', 'Customer not found');
    return new Types.ObjectId(id);
  }

  async register(dto: RegisterDto) {
    const exists = await this.customerRepo.findByEmail(dto.email);
    if (exists) throw new AppException('AUTH_EMAIL_CONFLICT');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const customer = await this.customerRepo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
    });

    await this.sendEmailAction(
      customer._id,
      customer.email,
      'verify_email',
      EVENTS.CUSTOMER_VERIFY_REQUESTED,
    );
    const tokens = await this.issueTokens(customer._id, customer.email);
    return { ...tokens, emailVerified: false };
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
    const customer = await this.customerRepo.findActiveByEmail(email, true);
    const ok = customer
      ? await bcrypt.compare(password, customer.passwordHash)
      : await bcrypt.compare(password, INVALID_BCRYPT_HASH);
    if (!customer || !ok) {
      throw new AppException(
        'AUTH_INVALID_CREDENTIALS',
        'Sai email hoặc mật khẩu',
      );
    }
    const tokens = await this.issueTokens(customer._id, customer.email);
    return { ...tokens, emailVerified: customer.emailVerified };
  }

  async googleLogin(idToken: string) {
    const decoded = await this.firebaseAdmin.verifyIdToken(idToken);
    if (!decoded.email) {
      throw new AppException('AUTH_FIREBASE_NO_EMAIL');
    }

    const existingByUid = await this.customerRepo.findByFirebaseUid(
      decoded.uid,
    );
    const existingByEmail = existingByUid
      ? existingByUid
      : await this.customerRepo.findActiveByEmail(decoded.email, true);

    const customer = existingByEmail
      ? existingByEmail.firebaseUid
        ? existingByEmail.firebaseUid === decoded.uid
          ? existingByEmail
          : (() => {
              throw new AppException('AUTH_FIREBASE_UID_MISMATCH');
            })()
        : await this.customerRepo.linkFirebaseUid(
            existingByEmail._id,
            decoded.uid,
          )
      : await this.customerRepo.create({
          email: decoded.email,
          firebaseUid: decoded.uid,
          passwordHash: await bcrypt.hash(generateOpaqueToken(), BCRYPT_ROUNDS),
          name: typeof decoded.name === 'string' ? decoded.name : undefined,
          phone: decoded.phone_number ?? undefined,
        });

    if (!customer) {
      throw new AppException('AUTH_FIREBASE_LOGIN_FAILED');
    }

    if (!customer.emailVerified) {
      await this.customerRepo.markEmailVerified(customer._id);
    }

    const tokens = await this.issueTokens(customer._id, customer.email);
    return { ...tokens, emailVerified: true };
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
      throw new AppException('AUTH_TOKEN_INVALID');
    }
    const customer = await this.customerRepo.findActiveById(doc.customerId);
    if (!customer) throw new AppException('AUTH_ACCOUNT_INACTIVE');

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
    if (!customer) throw new AppException('UNAUTHENTICATED');
    return customer;
  }

  async verifyEmail(email: string, code: string) {
    const customer = await this.customerRepo.findActiveByEmail(email);
    const ok = customer
      ? await this.otpStore.verify(
          customer._id.toString(),
          'verify_email',
          code,
        )
      : false;
    if (!customer || !ok) {
      throw new AppException('AUTH_OTP_INVALID');
    }
    await this.customerRepo.markEmailVerified(customer._id);
    return { success: true, emailVerified: true };
  }

  async resendVerifyEmail(customerId: string) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new AppException('UNAUTHENTICATED');
    if (customer.emailVerified) return { success: true, emailVerified: true };

    await this.sendEmailAction(
      customer._id,
      customer.email,
      'verify_email',
      EVENTS.CUSTOMER_VERIFY_REQUESTED,
    );
    return { success: true, emailVerified: false };
  }

  async forgotPassword(email: string) {
    const customer = await this.customerRepo.findActiveByEmail(email);
    if (customer) {
      await this.sendEmailAction(
        customer._id,
        customer.email,
        'reset_password',
        EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED,
      );
    }
    return { message: NEUTRAL_RESET_MESSAGE };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const customer = await this.customerRepo.findActiveByEmail(email);
    const ok = customer
      ? await this.otpStore.verify(
          customer._id.toString(),
          'reset_password',
          code,
        )
      : false;
    if (!customer || !ok) {
      // Trung lap: khong lo email ton tai / ma sai.
      throw new AppException('AUTH_OTP_INVALID');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.customerRepo.updatePassword(customer._id, passwordHash);
    await this.refreshRepo.revokeAllForCustomer(customer._id);
    return { success: true };
  }

  async changePassword(customerId: string, dto: ChangePasswordDto) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
      true,
    );
    const ok = customer
      ? await bcrypt.compare(dto.oldPassword, customer.passwordHash)
      : await bcrypt.compare(dto.oldPassword, INVALID_BCRYPT_HASH);
    if (!customer || !ok)
      throw new AppException(
        'AUTH_INVALID_CREDENTIALS',
        'Mật khẩu cũ không đúng',
      );

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.customerRepo.updatePassword(customer._id, passwordHash);
    return { success: true };
  }

  async listAddresses(customerId: string) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new AppException('UNAUTHENTICATED');
    return customer.addresses ?? [];
  }

  async addAddress(customerId: string, dto: AddressDto) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new AppException('UNAUTHENTICATED');

    const addresses = this.normalizeAddresses(customer.addresses ?? []);
    const shouldDefault = dto.isDefault === true || addresses.length === 0;
    const next = [
      ...addresses.map((address) => ({
        ...address,
        isDefault: shouldDefault ? false : address.isDefault,
      })),
      { _id: new Types.ObjectId(), ...dto, isDefault: shouldDefault },
    ];
    return this.saveAddresses(customer._id, next);
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new AppException('UNAUTHENTICATED');

    const addresses = this.normalizeAddresses(customer.addresses ?? []);
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
    return this.saveAddresses(customer._id, this.ensureOneDefault(next));
  }

  async deleteAddress(customerId: string, addressId: string) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new AppException('UNAUTHENTICATED');

    const addresses = this.normalizeAddresses(customer.addresses ?? []);
    const next = addresses.filter(
      (address) => address._id?.toString() !== addressId,
    );
    if (next.length === addresses.length)
      throw new AppException('NOT_FOUND', 'Địa chỉ không tồn tại');
    return this.saveAddresses(customer._id, this.ensureOneDefault(next));
  }

  async setDefaultAddress(customerId: string, addressId: string) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new AppException('UNAUTHENTICATED');

    const addresses = this.normalizeAddresses(customer.addresses ?? []);
    const exists = addresses.some(
      (address) => address._id?.toString() === addressId,
    );
    if (!exists) throw new AppException('NOT_FOUND', 'Địa chỉ không tồn tại');

    const next = addresses.map((address) => ({
      ...address,
      isDefault: address._id?.toString() === addressId,
    }));
    return this.saveAddresses(customer._id, next);
  }

  private normalizeAddresses(addresses: CustomerAddress[]) {
    return addresses.map((address) => {
      const doc = address as CustomerAddress & {
        toObject?: () => CustomerAddress;
      };
      const plain =
        typeof doc.toObject === 'function' ? doc.toObject() : address;
      return { ...plain };
    });
  }

  private ensureOneDefault(addresses: CustomerAddress[]) {
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
    customerId: Types.ObjectId,
    addresses: CustomerAddress[],
  ) {
    const customer = await this.customerRepo.replaceAddresses(
      customerId,
      this.ensureOneDefault(addresses),
    );
    if (!customer) throw new AppException('UNAUTHENTICATED');
    return customer.addresses;
  }
}
