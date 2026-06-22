import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
import { AuthTokenType } from './schemas/customer-auth-token.schema';
import { CustomerAddress } from './schemas/customer.schema';
import { CustomerAuthTokenRepository } from './repositories/customer-auth-token.repository';
import { CustomerRefreshTokenRepository } from './repositories/customer-refresh-token.repository';
import { CustomerRepository } from './repositories/customer.repository';

type MsDuration = Exclude<JwtSignOptions['expiresIn'], number | undefined>;

const BCRYPT_ROUNDS = 12;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const INVALID_BCRYPT_HASH = '$2a$12$invalidinvalidinvalidinvalidin';
const NEUTRAL_RESET_MESSAGE =
  'Neu email ton tai, chung toi da gui huong dan dat lai mat khau';

@Injectable()
export class AuthService {
  constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly refreshRepo: CustomerRefreshTokenRepository,
    private readonly authTokenRepo: CustomerAuthTokenRepository,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notifyQueue: Queue,
    private readonly jwt: JwtService,
    private readonly firebaseAdmin: FirebaseAdminService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  private objectId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Customer not found');
    return new Types.ObjectId(id);
  }

  async register(dto: RegisterDto) {
    const exists = await this.customerRepo.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email da duoc dang ky');

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
      AuthTokenType.VERIFY_EMAIL,
      EVENTS.CUSTOMER_VERIFY_REQUESTED,
      VERIFY_TOKEN_TTL_MS,
    );
    const tokens = await this.issueTokens(customer._id, customer.email);
    return { ...tokens, emailVerified: false };
  }

  private async sendEmailAction(
    customerId: Types.ObjectId,
    email: string,
    type: AuthTokenType,
    eventName:
      | typeof EVENTS.CUSTOMER_VERIFY_REQUESTED
      | typeof EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED,
    ttlMs: number,
  ) {
    const token = generateOpaqueToken();
    await this.authTokenRepo.create(
      customerId,
      type,
      hashToken(token),
      new Date(Date.now() + ttlMs),
    );
    const payload: CustomerEmailActionPayload = {
      customerId: customerId.toString(),
      email,
      token,
    };
    await this.notifyQueue.add(eventName, payload);
  }

  async login(email: string, password: string) {
    const customer = await this.customerRepo.findActiveByEmail(email, true);
    const ok = customer
      ? await bcrypt.compare(password, customer.passwordHash)
      : await bcrypt.compare(password, INVALID_BCRYPT_HASH);
    if (!customer || !ok) {
      throw new UnauthorizedException('Sai email hoac mat khau');
    }
    const tokens = await this.issueTokens(customer._id, customer.email);
    return { ...tokens, emailVerified: customer.emailVerified };
  }

  async googleLogin(idToken: string) {
    const decoded = await this.firebaseAdmin.verifyIdToken(idToken);
    if (!decoded.email) {
      throw new UnauthorizedException('Firebase token khong chua email');
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
              throw new UnauthorizedException(
                'Tai khoan da duoc lien ket Firebase khac',
              );
            })()
        : await this.customerRepo.linkFirebaseUid(
            existingByEmail._id,
            decoded.uid,
          )
      : await this.customerRepo.create({
          email: decoded.email,
          firebaseUid: decoded.uid,
          passwordHash: await bcrypt.hash(generateOpaqueToken(), BCRYPT_ROUNDS),
          name: decoded.name ?? undefined,
          phone: decoded.phone_number ?? undefined,
        });

    if (!customer) {
      throw new UnauthorizedException('Khong the dang nhap bang Firebase');
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
      throw new UnauthorizedException(
        'Refresh token khong hop le hoac da het han',
      );
    }
    const customer = await this.customerRepo.findActiveById(doc.customerId);
    if (!customer)
      throw new UnauthorizedException('Tai khoan khong con hieu luc');

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

  async verifyEmail(token: string) {
    const doc = await this.authTokenRepo.findValid(
      AuthTokenType.VERIFY_EMAIL,
      hashToken(token),
    );
    if (!doc || doc.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Token xac minh khong hop le hoac da het han',
      );
    }
    const customer = await this.customerRepo.markEmailVerified(doc.customerId);
    if (!customer)
      throw new BadRequestException('Tai khoan khong con hieu luc');
    doc.usedAt = new Date();
    await doc.save();
    return { success: true, emailVerified: true };
  }

  async resendVerifyEmail(customerId: string) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new UnauthorizedException();
    if (customer.emailVerified) return { success: true, emailVerified: true };

    await this.sendEmailAction(
      customer._id,
      customer.email,
      AuthTokenType.VERIFY_EMAIL,
      EVENTS.CUSTOMER_VERIFY_REQUESTED,
      VERIFY_TOKEN_TTL_MS,
    );
    return { success: true, emailVerified: false };
  }

  async forgotPassword(email: string) {
    const customer = await this.customerRepo.findActiveByEmail(email);
    if (customer) {
      await this.sendEmailAction(
        customer._id,
        customer.email,
        AuthTokenType.RESET_PASSWORD,
        EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED,
        RESET_TOKEN_TTL_MS,
      );
    }
    return { message: NEUTRAL_RESET_MESSAGE };
  }

  async resetPassword(token: string, newPassword: string) {
    const doc = await this.authTokenRepo.findValid(
      AuthTokenType.RESET_PASSWORD,
      hashToken(token),
    );
    if (!doc || doc.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Token dat lai mat khau khong hop le hoac da het han',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const customer = await this.customerRepo.updatePassword(
      doc.customerId,
      passwordHash,
    );
    if (!customer)
      throw new BadRequestException('Tai khoan khong con hieu luc');

    doc.usedAt = new Date();
    await doc.save();
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
      throw new UnauthorizedException('Mat khau cu khong dung');

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.customerRepo.updatePassword(customer._id, passwordHash);
    return { success: true };
  }

  async listAddresses(customerId: string) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new UnauthorizedException();
    return customer.addresses ?? [];
  }

  async addAddress(customerId: string, dto: AddressDto) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new UnauthorizedException();

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
    if (!customer) throw new UnauthorizedException();

    const addresses = this.normalizeAddresses(customer.addresses ?? []);
    const exists = addresses.some(
      (address) => address._id?.toString() === addressId,
    );
    if (!exists) throw new NotFoundException('Address not found');

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
    if (!customer) throw new UnauthorizedException();

    const addresses = this.normalizeAddresses(customer.addresses ?? []);
    const next = addresses.filter(
      (address) => address._id?.toString() !== addressId,
    );
    if (next.length === addresses.length)
      throw new NotFoundException('Address not found');
    return this.saveAddresses(customer._id, this.ensureOneDefault(next));
  }

  async setDefaultAddress(customerId: string, addressId: string) {
    const customer = await this.customerRepo.findActiveById(
      this.objectId(customerId),
    );
    if (!customer) throw new UnauthorizedException();

    const addresses = this.normalizeAddresses(customer.addresses ?? []);
    const exists = addresses.some(
      (address) => address._id?.toString() === addressId,
    );
    if (!exists) throw new NotFoundException('Address not found');

    const next = addresses.map((address) => ({
      ...address,
      isDefault: address._id?.toString() === addressId,
    }));
    return this.saveAddresses(customer._id, next);
  }

  private normalizeAddresses(addresses: CustomerAddress[]) {
    return addresses.map((address) => {
      const plain =
        typeof (address as any).toObject === 'function'
          ? (address as any).toObject()
          : address;
      return { ...plain } as CustomerAddress;
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
    if (!customer) throw new UnauthorizedException();
    return customer.addresses;
  }
}
