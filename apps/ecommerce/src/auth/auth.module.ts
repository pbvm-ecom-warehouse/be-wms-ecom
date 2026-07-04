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
import { UserRefreshTokenRepository } from './repositories/user-refresh-token.repository';
import { UserRepository } from './repositories/user.repository';
import { User, UserSchema } from './schemas/user.schema';
import {
  UserRefreshToken,
  UserRefreshTokenSchema,
} from './schemas/user-refresh-token.schema';

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
      { name: User.name, schema: UserSchema },
      { name: UserRefreshToken.name, schema: UserRefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    UserRepository,
    UserRefreshTokenRepository,
    OtpStore,
  ],
  exports: [AuthService, UserRepository],
})
export class AuthModule {}
