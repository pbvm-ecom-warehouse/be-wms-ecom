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
import { AuthService } from './auth.service';
import {
  AddressDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
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
  @ApiCreatedResponse({
    description: 'Tra accessToken + refreshToken, gui email xac minh',
  })
  @ApiConflictResponse({ description: 'Email da duoc dang ky' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
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
  @ApiOkResponse({
    description: 'Tra accessToken + refreshToken + emailVerified',
  })
  @ApiUnauthorizedResponse({ description: 'Sai email hoac mat khau' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
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
    description: 'Tra accessToken + refreshToken + emailVerified',
  })
  @ApiUnauthorizedResponse({ description: 'Firebase token khong hop le' })
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.auth.googleLogin(dto.idToken);
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
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
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
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thong tin khach dang dang nhap' })
  me(@CurrentUser('sub') customerId: string) {
    return this.auth.me(customerId);
  }

  @Post('verify-email')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Xac minh email bang ma OTP 6 so' })
  @ApiBody({
    type: VerifyEmailDto,
    examples: { verify: { value: { email: 'khach@example.com', code: '123456' } } },
  })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.email, dto.code);
  }

  @Post('resend-verify-email')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @AuthThrottle()
  @ApiOperation({ summary: 'Gui lai email xac minh cho khach dang dang nhap' })
  resendVerifyEmail(@CurrentUser('sub') customerId: string) {
    return this.auth.resendVerifyEmail(customerId);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Khoi tao luong quen mat khau' })
  @ApiBody({
    type: ForgotPasswordDto,
    examples: { forgot: { value: { email: 'khach@example.com' } } },
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Dat lai mat khau bang ma OTP 6 so' })
  @ApiBody({
    type: ResetPasswordDto,
    examples: {
      reset: {
        value: { email: 'khach@example.com', code: '123456', newPassword: 'NewP@ssw0rd123!' },
      },
    },
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.email, dto.code, dto.newPassword);
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
  changePassword(
    @CurrentUser('sub') customerId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(customerId, dto);
  }

  @Get('addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sach so dia chi' })
  listAddresses(@CurrentUser('sub') customerId: string) {
    return this.auth.listAddresses(customerId);
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
  addAddress(@CurrentUser('sub') customerId: string, @Body() dto: AddressDto) {
    return this.auth.addAddress(customerId, dto);
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
  updateAddress(
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.auth.updateAddress(customerId, id, dto);
  }

  @Post('addresses/:id/default')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dat dia chi mac dinh' })
  @ApiParam({ name: 'id', description: 'ObjectId cua address embedded' })
  setDefaultAddress(
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
  ) {
    return this.auth.setDefaultAddress(customerId, id);
  }

  @Delete('addresses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoa dia chi' })
  @ApiParam({ name: 'id', description: 'ObjectId cua address embedded' })
  deleteAddress(
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
  ) {
    return this.auth.deleteAddress(customerId, id);
  }
}
