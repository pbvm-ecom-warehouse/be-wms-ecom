import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AuthTokenResponseDto,
  UserResponseDto,
  CreateUserResponseDto,
  RefreshDto,
  LogoutDto,
} from './auth.dto';

describe('AuthTokenResponseDto', () => {
  it('expose accessToken, refreshToken, mustChangePassword — không expose field lạ', () => {
    const raw = {
      accessToken: 'at',
      refreshToken: 'rt',
      mustChangePassword: true,
      passwordHash: 'secret',
    };
    const dto = plainToInstance(AuthTokenResponseDto, raw, {
      excludeExtraneousValues: true,
    });
    expect(dto.accessToken).toBe('at');
    expect(dto.refreshToken).toBe('rt');
    expect(dto.mustChangePassword).toBe(true);
    expect((dto as Record<string, unknown>)['passwordHash']).toBeUndefined();
  });
});

describe('UserResponseDto', () => {
  it('expose id từ _id, không expose passwordHash/firebaseUid/deletedAt', () => {
    const raw = {
      _id: { toString: () => 'user-id-123' },
      username: 'admin',
      email: 'admin@example.com',
      name: 'Admin',
      roles: ['ADMIN'],
      status: 'ACTIVE',
      mustChangePassword: false,
      warehouseId: { toString: () => 'wh-id-456' },
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
      passwordHash: 'secret',
      firebaseUid: 'fb-uid',
      deletedAt: null,
    };
    const dto = plainToInstance(UserResponseDto, raw, {
      excludeExtraneousValues: true,
    });
    expect(dto.id).toBe('user-id-123');
    expect(dto.username).toBe('admin');
    expect(dto.warehouseId).toBe('wh-id-456');
    expect((dto as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect((dto as Record<string, unknown>)['firebaseUid']).toBeUndefined();
    expect((dto as Record<string, unknown>)['deletedAt']).toBeUndefined();
  });
});

describe('CreateUserResponseDto', () => {
  it('expose id, username, email, roles, mustChangePassword', () => {
    const raw = {
      _id: { toString: () => 'id-1' },
      username: 'user1',
      email: 'u@x.com',
      roles: ['RECEIVER'],
      mustChangePassword: true,
      passwordHash: 'x',
    };
    const dto = plainToInstance(CreateUserResponseDto, raw, {
      excludeExtraneousValues: true,
    });
    expect(dto.id).toBe('id-1');
    expect((dto as Record<string, unknown>)['passwordHash']).toBeUndefined();
  });
});

describe('RefreshDto — refreshToken optional', () => {
  it('pass validation khi không có refreshToken', async () => {
    const dto = plainToInstance(RefreshDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('pass validation khi có refreshToken', async () => {
    const dto = plainToInstance(RefreshDto, { refreshToken: 'abc' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('LogoutDto — refreshToken optional', () => {
  it('pass validation khi không có refreshToken', async () => {
    const dto = plainToInstance(LogoutDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
