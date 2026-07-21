import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EcomRole, WmsRole } from '../roles';
import { RolesGuard } from './roles.guard';

const createContext = (user?: Record<string, unknown>): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = {
    getAllAndOverride,
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  beforeEach(() => jest.clearAllMocks());

  it('cho qua route không khai role', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('cho qua khi role duy nhất của user nằm trong danh sách yêu cầu', () => {
    getAllAndOverride.mockReturnValue([WmsRole.RECEIVER, WmsRole.MANAGER]);

    expect(guard.canActivate(createContext({ role: WmsRole.RECEIVER }))).toBe(
      true,
    );
  });

  it.each([WmsRole.ADMIN, EcomRole.ECOM_MANAGER])(
    'cho %s bypass mọi role yêu cầu',
    (role) => {
      getAllAndOverride.mockReturnValue([WmsRole.PICKER]);

      expect(guard.canActivate(createContext({ role }))).toBe(true);
    },
  );

  it('từ chối khi role duy nhất không được yêu cầu', () => {
    getAllAndOverride.mockReturnValue([WmsRole.PICKER]);

    expect(() =>
      guard.canActivate(createContext({ role: WmsRole.RECEIVER })),
    ).toThrow(new ForbiddenException('Không đủ quyền truy cập tài nguyên này'));
  });
});
