import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { FirebaseAdminModule } from '@app/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UserRefreshTokenRepository } from './repositories/user-refresh-token.repository';
import {
  UserRefreshToken,
  UserRefreshTokenSchema,
} from './schemas/user-refresh-token.schema';

/**
 * Module auth WMS. JwtModule đăng ký rỗng (secret/expiresIn truyền lúc sign trong
 * service từ ConfigService) — để 1 nơi quản secret. PassportModule nạp JwtStrategy.
 * UserRepository lấy từ UsersModule (không đăng ký User schema lại ở đây) — login
 * và quản lý user không nên tách rời 2 nguồn dữ liệu.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    FirebaseAdminModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: UserRefreshToken.name, schema: UserRefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, UserRefreshTokenRepository],
  exports: [AuthService],
})
export class AuthModule {}
