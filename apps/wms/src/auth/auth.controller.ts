import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
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
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  @AuthThrottle()
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  /** Khởi tạo admin đầu tiên — chỉ chạy khi hệ thống chưa có nhân viên nào. */
  @Post('bootstrap-admin')
  bootstrapAdmin(@Body() dto: CreateUserDto) {
    return this.auth.bootstrapAdmin(dto);
  }

  /** Tạo nhân viên mới — chỉ ADMIN. */
  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  createUser(@Body() dto: CreateUserDto, @CurrentUser('sub') by: string) {
    return this.auth.createUser(dto, by);
  }
}
