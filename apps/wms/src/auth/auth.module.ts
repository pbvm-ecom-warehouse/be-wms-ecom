import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User, UserSchema } from './schemas/user.schema';
import {
  UserRefreshToken,
  UserRefreshTokenSchema,
} from './schemas/user-refresh-token.schema';

/**
 * Module auth WMS. JwtModule đăng ký rỗng (secret/expiresIn truyền lúc sign trong
 * service từ ConfigService) — để 1 nơi quản secret. PassportModule nạp JwtStrategy.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserRefreshToken.name, schema: UserRefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
