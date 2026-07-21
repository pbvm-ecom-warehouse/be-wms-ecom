import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { appConfig } from '../config/app.config';
import { UserResponseDto } from '../users/dto/user.response.dto';

const mockAuthService = {
  login: jest.fn(),
  googleLogin: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  me: jest.fn(),
  bootstrapAdmin: jest.fn(),
  changePassword: jest.fn(),
};

const mockAppConfig = { env: 'development' };

const makeMockRes = () => ({
  cookie: jest.fn(),
  clearCookie: jest.fn(),
});

const makeMockReq = (cookies: Record<string, string> = {}) => ({ cookies });

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: appConfig.KEY, useValue: mockAppConfig },
      ],
    }).compile();
    controller = module.get(AuthController);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('set cookie và trả AuthTokenResponseDto', async () => {
      const tokens = {
        accessToken: 'at',
        refreshToken: 'rt',
        mustChangePassword: false,
      };
      mockAuthService.login.mockResolvedValue(tokens);
      const res = makeMockRes();

      const result = await controller.login(
        { username: 'admin', password: 'pass' },
        res as never,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'at',
        expect.objectContaining({ httpOnly: true, path: '/api/wms' }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'rt',
        expect.objectContaining({ httpOnly: true, path: '/api/wms/auth' }),
      );
      expect(result).toMatchObject({
        accessToken: 'at',
        refreshToken: 'rt',
        mustChangePassword: false,
      });
    });
  });

  describe('googleLogin', () => {
    it('set cookie và trả AuthTokenResponseDto', async () => {
      const tokens = {
        accessToken: 'at',
        refreshToken: 'rt',
        mustChangePassword: false,
      };
      mockAuthService.googleLogin.mockResolvedValue(tokens);
      const res = makeMockRes();

      const result = await controller.googleLogin(
        { idToken: 'firebase-id-token' },
        res as never,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'at',
        expect.objectContaining({ httpOnly: true, path: '/api/wms' }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'rt',
        expect.objectContaining({ httpOnly: true, path: '/api/wms/auth' }),
      );
      expect(result).toMatchObject({
        accessToken: 'at',
        refreshToken: 'rt',
        mustChangePassword: false,
      });
    });
  });

  describe('refresh', () => {
    it('ưu tiên body refreshToken', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'at2',
        refreshToken: 'rt2',
        mustChangePassword: false,
      });
      const res = makeMockRes();
      const req = makeMockReq({ refresh_token: 'cookie-token' });

      await controller.refresh(
        { refreshToken: 'body-token' },
        res as never,
        req as never,
      );

      expect(mockAuthService.refresh).toHaveBeenCalledWith('body-token');
    });

    it('fallback cookie khi body không có refreshToken', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'at2',
        refreshToken: 'rt2',
        mustChangePassword: false,
      });
      const res = makeMockRes();
      const req = makeMockReq({ refresh_token: 'cookie-token' });

      await controller.refresh({}, res as never, req as never);

      expect(mockAuthService.refresh).toHaveBeenCalledWith('cookie-token');
    });
  });

  describe('logout', () => {
    it('clear cookie sau khi revoke', async () => {
      mockAuthService.logout.mockResolvedValue({ success: true });
      const res = makeMockRes();
      const req = makeMockReq({ refresh_token: 'rt' });

      await controller.logout({}, res as never, req as never);

      expect(res.clearCookie).toHaveBeenCalledWith('access_token', {
        path: '/api/wms',
      });
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/api/wms/auth',
      });
    });
  });

  describe('me', () => {
    it('trả UserResponseDto — không có passwordHash', async () => {
      mockAuthService.me.mockResolvedValue({
        _id: { toString: () => 'uid' },
        username: 'admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        mustChangePassword: false,
        passwordHash: 'secret',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await controller.me('uid');
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(
        (result as unknown as Record<string, unknown>)['passwordHash'],
      ).toBeUndefined();
      expect(result.id).toBe('uid');
    });
  });
});
