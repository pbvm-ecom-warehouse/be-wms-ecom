import {
  Body,
  Controller,
  Delete,
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
  ApiConflictResponse,
  ApiCreatedResponse,
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
  EcomRole,
} from '@app/auth';
import { AppException, AuthThrottle } from '@app/common';
import type { ConfigType } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';
import { appConfig } from '../config/app.config';
import { AuthService } from './auth.service';
import {
  AddressDto,
  AddressResponseDto,
  AuthTokenResponseDto,
  ChangePasswordDto,
  UserResponseDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  CreateEcomManagerDto,
  ResetPasswordDto,
  SuccessResponseDto,
  UpdateAddressDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly isProd: boolean;

  constructor(
    private readonly auth: AuthService,
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
  ) {
    this.isProd = this.appCfg.env === 'production';
  }

  // Cookie access_token: path rộng để dùng mọi route Ecommerce.
  // Cookie refresh_token: path hẹp /api/shop/auth để browser chỉ gửi lên auth endpoints.
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
      path: '/api/shop',
    });
    res.cookie('refresh_token', tokens.refreshToken, {
      ...base,
      path: '/api/shop/auth',
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', { path: '/api/shop' });
    res.clearCookie('refresh_token', { path: '/api/shop/auth' });
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

  @Post('register')
  @AuthThrottle()
  @ApiOperation({ summary: 'Dang ky tai khoan moi' })
  @ApiBody({
    type: RegisterDto,
    examples: {
      user: {
        value: {
          email: 'user@example.com',
          password: 'P@ssw0rd123!',
          name: 'Nguyen Thi B',
          phone: '0901234567',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: AuthTokenResponseDto })
  @ApiConflictResponse({ description: 'Email da duoc dang ky' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto);
    this.setAuthCookies(res, result);
    return plainToInstance(AuthTokenResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Dang nhap' })
  @ApiBody({
    type: LoginDto,
    examples: {
      user: {
        value: { email: 'user@example.com', password: 'P@ssw0rd123!' },
      },
    },
  })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description:
      'Trả token trong body VÀ set cookie access_token + refresh_token',
  })
  @ApiUnauthorizedResponse({ description: 'Sai email hoac mat khau' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password);
    this.setAuthCookies(res, result);
    return plainToInstance(AuthTokenResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('google-login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Dang nhap bang Google/Firebase' })
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
  @ApiUnauthorizedResponse({ description: 'Firebase token khong hop le' })
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.googleLogin(dto.idToken);
    this.setAuthCookies(res, result);
    return plainToInstance(AuthTokenResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lam moi cap access/refresh token' })
  @ApiBody({
    type: RefreshDto,
    examples: {
      refresh: { value: { refreshToken: 'opaque-refresh-token-value' } },
    },
  })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description: 'Set cookie moi va tra token cap nhat',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token khong hop le hoac het han',
  })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractRefreshToken(dto, req);
    const result = await this.auth.refresh(token);
    this.setAuthCookies(res, result);
    return plainToInstance(AuthTokenResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dang xuat (thu hoi refresh token va xoa cookie)' })
  @ApiBody({
    type: LogoutDto,
    examples: {
      logout: { value: { refreshToken: 'opaque-refresh-token-value' } },
    },
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.extractRefreshToken(dto, req);
    const result = await this.auth.logout(refreshToken);
    this.clearAuthCookies(res);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thong tin nguoi dung dang dang nhap' })
  @ApiOkResponse({ type: UserResponseDto })
  async me(@CurrentUser('sub') userId: string) {
    const result = await this.auth.me(userId);
    return plainToInstance(UserResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('verify-email')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Xac minh email bang ma OTP 6 so' })
  @ApiBody({
    type: VerifyEmailDto,
    examples: {
      verify: { value: { email: 'user@example.com', code: '123456' } },
    },
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const result = await this.auth.verifyEmail(dto.email, dto.code);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('resend-verify-email')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @AuthThrottle()
  @ApiOperation({
    summary: 'Gui lai email xac minh cho nguoi dung dang dang nhap',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async resendVerifyEmail(@CurrentUser('sub') userId: string) {
    const result = await this.auth.resendVerifyEmail(userId);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('forgot-password')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Khoi tao luong quen mat khau' })
  @ApiBody({
    type: ForgotPasswordDto,
    examples: { forgot: { value: { email: 'user@example.com' } } },
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.auth.forgotPassword(dto.email);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('reset-password')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Dat lai mat khau bang ma OTP 6 so' })
  @ApiBody({
    type: ResetPasswordDto,
    examples: {
      reset: {
        value: {
          email: 'user@example.com',
          code: '123456',
          newPassword: 'NewP@ssw0rd123!',
        },
      },
    },
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.auth.resetPassword(
      dto.email,
      dto.code,
      dto.newPassword,
    );
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nguoi dung doi mat khau' })
  @ApiBody({
    type: ChangePasswordDto,
    examples: {
      change: {
        value: { oldPassword: 'P@ssw0rd123!', newPassword: 'NewP@ssw0rd123!' },
      },
    },
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.auth.changePassword(userId, dto);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sach so dia chi' })
  @ApiOkResponse({ type: [AddressResponseDto] })
  async listAddresses(@CurrentUser('sub') userId: string) {
    const result = await this.auth.listAddresses(userId);
    return plainToInstance(AddressResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Them dia chi moi' })
  @ApiBody({
    type: AddressDto,
    examples: {
      home: {
        value: {
          label: 'Home',
          recipientName: 'Nguyen Thi B',
          phone: '0901234567',
          line: '123 Nguyen Trai',
          ward: 'Ward 1',
          district: 'District 1',
          province: 'Ho Chi Minh',
          isDefault: true,
        },
      },
    },
  })
  @ApiCreatedResponse({ type: [AddressResponseDto] })
  async addAddress(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddressDto,
  ) {
    const result = await this.auth.addAddress(userId, dto);
    return plainToInstance(AddressResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Patch('addresses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cap nhat dia chi' })
  @ApiParam({ name: 'id', description: 'ObjectId cua address embedded' })
  @ApiBody({
    type: UpdateAddressDto,
    examples: { patch: { value: { label: 'Office', isDefault: true } } },
  })
  @ApiOkResponse({ type: [AddressResponseDto] })
  async updateAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const result = await this.auth.updateAddress(userId, id, dto);
    return plainToInstance(AddressResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('addresses/:id/default')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dat dia chi mac dinh' })
  @ApiParam({ name: 'id', description: 'ObjectId cua address embedded' })
  @ApiOkResponse({ type: [AddressResponseDto] })
  async setDefaultAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    const result = await this.auth.setDefaultAddress(userId, id);
    return plainToInstance(AddressResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Delete('addresses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoa dia chi' })
  @ApiParam({ name: 'id', description: 'ObjectId cua address embedded' })
  @ApiOkResponse({ type: [AddressResponseDto] })
  async deleteAddress(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    const result = await this.auth.deleteAddress(userId, id);
    return plainToInstance(AddressResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('admin/create-manager')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(EcomRole.ECOM_MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Ecom_Manager tạo một Ecom_Manager khác' })
  @ApiCreatedResponse({ type: UserResponseDto })
  async createEcomManager(@Body() dto: CreateEcomManagerDto) {
    const result = await this.auth.createEcomManager(dto);
    return plainToInstance(UserResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }
}
