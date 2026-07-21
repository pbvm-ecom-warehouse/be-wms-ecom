import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthTokenResponseDto, RefreshDto, LogoutDto } from './auth.dto';

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

// UserResponseDto/CreateUserResponseDto đã chuyển sang
// apps/wms/src/users/dto/user.response.dto.ts (Task 3) — coverage tương ứng
// nằm ở users/ (xem users.controller.spec.ts + auth.controller.spec.ts `me`).

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
