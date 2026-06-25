import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  WmsRole,
} from '@app/auth';
import { AppException, AuthThrottle } from '@app/common';
import type { ConfigType } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';
import { appConfig } from '../config/app.config';
import { AuthService } from './auth.service';
import {
  AuthTokenResponseDto,
  ChangePasswordDto,
  CreateUserDto,
  CreateUserResponseDto,
  GoogleLoginDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  ResetUserPasswordDto,
  UpdateUserRolesDto,
  UserResponseDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly isProd: boolean;

  constructor(
    private readonly auth: AuthService,
    @Inject(appConfig.KEY) private readonly appCfg: ConfigType<typeof appConfig>,
  ) {
    this.isProd = this.appCfg.env === 'production';
  }

  // Cookie access_token: path rộng để dùng mọi route WMS.
  // Cookie refresh_token: path hẹp /api/wms/auth để browser chỉ gửi lên auth endpoints.
  private setAuthCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const base = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.isProd,
    };
    res.cookie('access_token', tokens.accessToken, {
      ...base,
      path: '/api/wms',
    });
    res.cookie('refresh_token', tokens.refreshToken, {
      ...base,
      path: '/api/wms/auth',
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', { path: '/api/wms' });
    res.clearCookie('refresh_token', { path: '/api/wms/auth' });
  }

  // Ưu tiên body, fallback cookie — để API client và web browser đều dùng được.
  private extractRefreshToken(
    dto: RefreshDto | LogoutDto,
    req: Request,
  ): string {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = dto.refreshToken ?? cookies?.['refresh_token'];
    if (!token) throw new AppException('AUTH_TOKEN_INVALID');
    return token;
  }

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng nhập nhân viên' })
  @ApiBody({
    type: LoginDto,
    examples: {
      admin: {
        summary: 'Admin',
        value: { username: 'admin', password: 'P@ssw0rd123!' },
      },
    },
  })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description:
      'Trả token trong body VÀ set cookie access_token + refresh_token',
  })
  @ApiUnauthorizedResponse({ description: 'Sai tài khoản hoặc mật khẩu' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponseDto> {
    const tokens = await this.auth.login(dto.username, dto.password);
    this.setAuthCookies(res, tokens);
    return plainToInstance(AuthTokenResponseDto, tokens, {
      excludeExtraneousValues: true,
    });
  }

  @Post('google-login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng nhập bằng Google/Firebase' })
  @ApiBody({
    type: GoogleLoginDto,
    examples: {
      google: { value: { idToken: 'paste-firebase-id-token-here' } },
    },
  })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description:
      'Trả token trong body VÀ set cookie access_token + refresh_token',
  })
  @ApiUnauthorizedResponse({
    description: 'Firebase token không hợp lệ hoặc nhân viên chưa khởi tạo',
  })
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponseDto> {
    const tokens = await this.auth.googleLogin(dto.idToken);
    this.setAuthCookies(res, tokens);
    return plainToInstance(AuthTokenResponseDto, tokens, {
      excludeExtraneousValues: true,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({
    summary: 'Đổi access token mới bằng refresh token (body hoặc cookie)',
  })
  @ApiBody({
    type: RefreshDto,
    examples: {
      bearer: {
        summary: 'Bearer mode',
        value: { refreshToken: 'paste-refresh-token-here' },
      },
      cookie: { summary: 'Cookie mode', value: {} },
    },
  })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description: 'Trả token mới trong body VÀ set cookie mới (rotate)',
  })
  async refresh(
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<AuthTokenResponseDto> {
    const refreshToken = this.extractRefreshToken(dto, req);
    const tokens = await this.auth.refresh(refreshToken);
    this.setAuthCookies(res, tokens);
    return plainToInstance(AuthTokenResponseDto, tokens, {
      excludeExtraneousValues: true,
    });
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất và thu hồi refresh token' })
  @ApiOkResponse({ description: '{ success: true } — cookies cleared, token revoked' })
  @ApiBody({
    type: LogoutDto,
    examples: {
      bearer: {
        summary: 'Bearer mode',
        value: { refreshToken: 'paste-refresh-token-here' },
      },
      cookie: { summary: 'Cookie mode', value: {} },
    },
  })
  async logout(
    @Body() dto: LogoutDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const refreshToken = this.extractRefreshToken(dto, req);
    const result = await this.auth.logout(refreshToken);
    this.clearAuthCookies(res);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin nhân viên đang đăng nhập' })
  @ApiOkResponse({ type: UserResponseDto })
  async me(@CurrentUser('sub') userId: string): Promise<UserResponseDto> {
    const user = await this.auth.me(userId);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Post('bootstrap-admin')
  @ApiOperation({
    summary: 'Khởi tạo admin đầu tiên khi hệ thống chưa có user',
  })
  @ApiBody({
    type: CreateUserDto,
    examples: {
      bootstrap: {
        value: {
          username: 'admin',
          password: 'P@ssw0rd123!',
          email: 'admin@example.com',
          name: 'System Admin',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: CreateUserResponseDto })
  @ApiForbiddenResponse({ description: 'Đã có nhân viên trong hệ thống' })
  async bootstrapAdmin(
    @Body() dto: CreateUserDto,
  ): Promise<CreateUserResponseDto> {
    const user = await this.auth.bootstrapAdmin(dto);
    return plainToInstance(CreateUserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo nhân viên mới — chỉ ADMIN' })
  @ApiBody({
    type: CreateUserDto,
    examples: {
      receiver: {
        value: {
          username: 'receiver01',
          password: 'TempP@ssw0rd123!',
          email: 'receiver01@example.com',
          name: 'Receiver 01',
          roles: ['RECEIVER'],
        },
      },
    },
  })
  @ApiCreatedResponse({ type: CreateUserResponseDto })
  async createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser('sub') by: string,
  ): Promise<CreateUserResponseDto> {
    const user = await this.auth.createUser(dto, by);
    return plainToInstance(CreateUserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Patch('users/:id/roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gán/sửa roles nhân viên — chỉ ADMIN' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiBody({
    type: UpdateUserRolesDto,
    examples: { roles: { value: { roles: ['RECEIVER', 'PICKER'] } } },
  })
  @ApiOkResponse({ type: UserResponseDto })
  async updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser('sub') by: string,
  ): Promise<UserResponseDto> {
    const user = await this.auth.updateRoles(id, dto.roles, by);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Post('users/:id/lock')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Khóa tài khoản và revoke tất cả refresh token' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiOkResponse({ type: UserResponseDto })
  async lockUser(
    @Param('id') id: string,
    @CurrentUser('sub') by: string,
  ): Promise<UserResponseDto> {
    const user = await this.auth.lockUser(id, by);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Post('users/:id/unlock')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mở khóa tài khoản' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiOkResponse({ type: UserResponseDto })
  async unlockUser(
    @Param('id') id: string,
    @CurrentUser('sub') by: string,
  ): Promise<UserResponseDto> {
    const user = await this.auth.unlockUser(id, by);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset mật khẩu tạm và bắt đổi mật khẩu' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiBody({
    type: ResetUserPasswordDto,
    examples: { reset: { value: { temporaryPassword: 'TempP@ssw0rd123!' } } },
  })
  @ApiOkResponse({ description: '{ success: true, mustChangePassword: true }' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser('sub') by: string,
  ): Promise<{ success: boolean; mustChangePassword: boolean }> {
    return this.auth.resetTemporaryPassword(id, dto.temporaryPassword, by);
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nhân viên đổi mật khẩu' })
  @ApiBody({
    type: ChangePasswordDto,
    examples: {
      change: {
        value: {
          oldPassword: 'TempP@ssw0rd123!',
          newPassword: 'NewP@ssw0rd123!',
        },
      },
    },
  })
  @ApiOkResponse({
    description: '{ success: true, mustChangePassword: false }',
  })
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean; mustChangePassword: boolean }> {
    return this.auth.changePassword(userId, dto);
  }
}
