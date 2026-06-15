import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './dto/auth.dto';

/**
 * Auth khách — prefix toàn cục 'api/shop' nên route thực tế là /api/shop/auth/*.
 * register/login/refresh public; me/logout cần JWT khách.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng ký tài khoản khách mới' })
  @ApiCreatedResponse({ description: 'Trả accessToken + refreshToken, gửi email xác minh' })
  @ApiConflictResponse({ description: 'Email đã được đăng ký' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng nhập khách hàng' })
  @ApiOkResponse({ description: 'Trả accessToken + refreshToken + emailVerified' })
  @ApiUnauthorizedResponse({ description: 'Sai email hoặc mật khẩu' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đổi access token mới bằng refresh token' })
  @ApiOkResponse({ description: 'Trả accessToken + refreshToken mới (rotate)' })
  @ApiUnauthorizedResponse({ description: 'Refresh token không hợp lệ hoặc hết hạn' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất — thu hồi refresh token' })
  @ApiOkResponse({ description: '{ success: true }' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin khách đang đăng nhập' })
  @ApiOkResponse({ description: 'Document Customer (không có passwordHash)' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  me(@CurrentUser('sub') customerId: string) {
    return this.auth.me(customerId);
  }
}
