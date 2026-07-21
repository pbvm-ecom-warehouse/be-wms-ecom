import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserRefreshTokenRepository } from '../auth/repositories/user-refresh-token.repository';
import {
  UserRefreshToken,
  UserRefreshTokenSchema,
} from '../auth/schemas/user-refresh-token.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRepository } from './repositories/user.repository';
import { User, UserSchema } from './schemas/user.schema';

/**
 * UserRefreshToken model đăng ký lại ở đây (KHÔNG di chuyển khỏi auth/) vì
 * UsersService cần revoke token khi lock/reset-password. Mongoose cho phép
 * forFeature cùng 1 schema ở nhiều module — dùng chung 1 connection.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserRefreshToken.name, schema: UserRefreshTokenSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, UserRepository, UserRefreshTokenRepository],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
