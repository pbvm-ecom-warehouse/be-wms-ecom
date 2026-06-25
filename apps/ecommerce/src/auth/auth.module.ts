import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { FirebaseAdminModule } from '@app/common';
import { QUEUES } from '@app/events';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpStore } from './otp.store';
import { JwtStrategy } from './jwt.strategy';
import { CustomerAuthTokenRepository } from './repositories/customer-auth-token.repository';
import { CustomerRefreshTokenRepository } from './repositories/customer-refresh-token.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import {
  CustomerAuthToken,
  CustomerAuthTokenSchema,
} from './schemas/customer-auth-token.schema';
import {
  CustomerRefreshToken,
  CustomerRefreshTokenSchema,
} from './schemas/customer-refresh-token.schema';

/**
 * Module auth Ecommerce. Đăng ký queue NOTIFICATION để phát event
 * customer.verify_requested (Ecom → Notification) khi khách đăng ký.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    FirebaseAdminModule,
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION }),
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerRefreshToken.name, schema: CustomerRefreshTokenSchema },
      { name: CustomerAuthToken.name, schema: CustomerAuthTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    CustomerRepository,
    CustomerRefreshTokenRepository,
    CustomerAuthTokenRepository,
    OtpStore,
  ],
  exports: [AuthService],
})
export class AuthModule {}
