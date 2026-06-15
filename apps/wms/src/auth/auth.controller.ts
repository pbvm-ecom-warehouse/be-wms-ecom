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
import { AuthThrottle } from '@app/common';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginDto, LogoutDto, RefreshDto } from './dto/auth.dto';

/**
 * Auth nhân viên WMS — prefix toàn cục 'api/wms' nên route thực tế là /api/wms/auth/*.
 * login/refresh/bootstrap-admin là public; còn lại cần JWT (+ role khi tạo user).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng nhập nhân viên' })
  @ApiOkResponse({ description: 'Trả accessToken + refreshToken + mustChangePassword' })
  @ApiUnauthorizedResponse({ description: 'Sai tài khoản hoặc mật khẩu' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
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
  @ApiOperation({ summary: 'Thông tin nhân viên đang đăng nhập' })
  @ApiOkResponse({ description: 'Document User (không có passwordHash)' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  @Post('bootstrap-admin')
  @ApiOperation({ summary: 'Khởi tạo admin đầu tiên — chỉ chạy khi hệ thống chưa có nhân viên nào' })
  @ApiCreatedResponse({ description: '{ id, username, roles }' })
  @ApiForbiddenResponse({ description: 'Đã có nhân viên trong hệ thống' })
  bootstrapAdmin(@Body() dto: CreateUserDto) {
    return this.auth.bootstrapAdmin(dto);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo nhân viên mới — chỉ ADMIN' })
  @ApiCreatedResponse({ description: '{ id, username, roles }' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  @ApiForbiddenResponse({ description: 'Không đủ quyền ADMIN' })
  createUser(@Body() dto: CreateUserDto, @CurrentUser('sub') by: string) {
    return this.auth.createUser(dto, by);
  }
}
