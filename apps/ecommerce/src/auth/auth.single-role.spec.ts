jest.mock('@app/common', () => ({
  durationToMs: jest.fn().mockReturnValue(60_000),
  generateOpaqueToken: jest.fn().mockReturnValue('refresh-token'),
  hashToken: jest.fn().mockReturnValue('hashed-refresh-token'),
  FirebaseAdminService: class {},
  AppException: class AppException extends Error {},
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn(),
}));

import { EcomRole } from '@app/auth';
import { plainToInstance } from 'class-transformer';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import { UserResponseDto } from './dto/auth.dto';
import { UserSchema } from './schemas/user.schema';

describe('Ecommerce auth single role', () => {
  it('không khai báo roles trong User schema', () => {
    expect(UserSchema.path('roles')).toBeUndefined();
  });

  it('không trả roles trong response DTO của customer', () => {
    const response = plainToInstance(
      UserResponseDto,
      {
        _id: new Types.ObjectId(),
        email: 'customer@example.com',
        type: 'customer',
        roles: ['customer'],
        addresses: [],
      },
      { excludeExtraneousValues: true },
    );

    expect(response).not.toHaveProperty('roles');
  });

  it.each([
    ['customer', EcomRole.CUSTOMER],
    ['admin', EcomRole.ECOM_MANAGER],
  ] as const)(
    'login user type %s ký JWT với scalar role %s',
    async (type, role) => {
      const user = {
        _id: new Types.ObjectId(),
        email: `${type}@example.com`,
        passwordHash: 'hash',
        emailVerified: true,
        type,
      };
      const userRepo = {
        findActiveByEmail: jest.fn().mockResolvedValue(user),
      };
      const refreshRepo = {
        create: jest.fn().mockResolvedValue(undefined),
      };
      const jwt = {
        signAsync: jest.fn().mockResolvedValue('access-token'),
      };
      const service = new AuthService(
        userRepo as any,
        refreshRepo as any,
        {} as any,
        {} as any,
        jwt as any,
        {} as any,
        {
          jwtSecret: 'ecom-secret',
          jwtExpiresIn: '30d',
          refreshExpiresIn: '60d',
        },
        {} as any,
      );

      await service.login(user.email, 'password');

      expect(jwt.signAsync).toHaveBeenCalledWith(
        {
          sub: user._id.toString(),
          type,
          email: user.email,
          role,
        },
        { secret: 'ecom-secret', expiresIn: '30d' },
      );
    },
  );
});
