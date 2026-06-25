import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
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
import { CurrentUser, JwtAuthGuard } from '@app/auth';
import { AuthThrottle } from '@app/common';
import { plainToInstance } from 'class-transformer';
import { AuthService } from './auth.service';
import {
  AddressDto,
  AddressResponseDto,
  AuthTokenResponseDto,
  ChangePasswordDto,
  CustomerResponseDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SuccessResponseDto,
  UpdateAddressDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @AuthThrottle()
  @ApiOperation({ summary: 'Dang ky tai khoan khach moi' })
  @ApiBody({
    type: RegisterDto,
    examples: {
      customer: {
        value: {
          email: 'khach@example.com',
          password: 'P@ssw0rd123!',
          name: 'Nguyen Thi B',
          phone: '0901234567',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: AuthTokenResponseDto })
  @ApiConflictResponse({ description: 'Email da duoc dang ky' })
  async register(@Body() dto: RegisterDto) {
    const result = await this.auth.register(dto);
    return plainToInstance(AuthTokenResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Dang nhap khach hang' })
  @ApiBody({
    type: LoginDto,
    examples: {
      customer: {
        value: { email: 'khach@example.com', password: 'P@ssw0rd123!' },
      },
    },
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Sai email hoac mat khau' })
  async login(@Body() dto: LoginDto) {
    const result = await this.auth.login(dto.email, dto.password);
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
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Firebase token khong hop le' })
  async googleLogin(@Body() dto: GoogleLoginDto) {
    const result = await this.auth.googleLogin(dto.idToken);
    return plainToInstance(AuthTokenResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Doi access token moi bang refresh token' })
  @ApiBody({
    type: RefreshDto,
    examples: {
      refresh: { value: { refreshToken: 'paste-refresh-token-here' } },
    },
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  async refresh(@Body() dto: RefreshDto) {
    const result = await this.auth.refresh(dto.refreshToken);
    return plainToInstance(AuthTokenResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dang xuat va thu hoi refresh token' })
  @ApiBody({
    type: LogoutDto,
    examples: {
      logout: { value: { refreshToken: 'paste-refresh-token-here' } },
    },
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async logout(@Body() dto: LogoutDto) {
    const result = await this.auth.logout(dto.refreshToken);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thong tin khach dang dang nhap' })
  @ApiOkResponse({ type: CustomerResponseDto })
  async me(@CurrentUser('sub') customerId: string) {
    const result = await this.auth.me(customerId);
    return plainToInstance(CustomerResponseDto, result, {
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
      verify: { value: { email: 'khach@example.com', code: '123456' } },
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
  @ApiOperation({ summary: 'Gui lai email xac minh cho khach dang dang nhap' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async resendVerifyEmail(@CurrentUser('sub') customerId: string) {
    const result = await this.auth.resendVerifyEmail(customerId);
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
    examples: { forgot: { value: { email: 'khach@example.com' } } },
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
          email: 'khach@example.com',
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
  @ApiOperation({ summary: 'Khach doi mat khau' })
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
    @CurrentUser('sub') customerId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.auth.changePassword(customerId, dto);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sach so dia chi' })
  @ApiOkResponse({ type: [AddressResponseDto] })
  async listAddresses(@CurrentUser('sub') customerId: string) {
    const result = await this.auth.listAddresses(customerId);
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
    @CurrentUser('sub') customerId: string,
    @Body() dto: AddressDto,
  ) {
    const result = await this.auth.addAddress(customerId, dto);
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
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const result = await this.auth.updateAddress(customerId, id, dto);
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
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
  ) {
    const result = await this.auth.setDefaultAddress(customerId, id);
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
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
  ) {
    const result = await this.auth.deleteAddress(customerId, id);
    return plainToInstance(AddressResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }
}
