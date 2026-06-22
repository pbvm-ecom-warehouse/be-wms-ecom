import {
  Body,
  Controller,
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
import {
  ChangePasswordDto,
  CreateUserDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  ResetUserPasswordDto,
  UpdateUserRolesDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Dang nhap nhan vien' })
  @ApiBody({ type: LoginDto, examples: { admin: { summary: 'Admin', value: { username: 'admin', password: 'P@ssw0rd123!' } } } })
  @ApiOkResponse({ description: 'Tra accessToken + refreshToken + mustChangePassword' })
  @ApiUnauthorizedResponse({ description: 'Sai tai khoan hoac mat khau' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Doi access token moi bang refresh token' })
  @ApiBody({ type: RefreshDto, examples: { refresh: { value: { refreshToken: 'paste-refresh-token-here' } } } })
  @ApiOkResponse({ description: 'Tra accessToken + refreshToken moi (rotate)' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dang xuat va thu hoi refresh token' })
  @ApiBody({ type: LogoutDto, examples: { logout: { value: { refreshToken: 'paste-refresh-token-here' } } } })
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thong tin nhan vien dang dang nhap' })
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  @Post('bootstrap-admin')
  @ApiOperation({ summary: 'Khoi tao admin dau tien khi he thong chua co user' })
  @ApiBody({ type: CreateUserDto, examples: { bootstrap: { value: { username: 'admin', password: 'P@ssw0rd123!', email: 'admin@example.com', name: 'System Admin' } } } })
  @ApiCreatedResponse({ description: '{ id, username, roles }' })
  @ApiForbiddenResponse({ description: 'Da co nhan vien trong he thong' })
  bootstrapAdmin(@Body() dto: CreateUserDto) {
    return this.auth.bootstrapAdmin(dto);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tao nhan vien moi - chi ADMIN' })
  @ApiBody({ type: CreateUserDto, examples: { receiver: { value: { username: 'receiver01', password: 'TempP@ssw0rd123!', email: 'receiver01@example.com', name: 'Receiver 01', roles: ['RECEIVER'] } } } })
  createUser(@Body() dto: CreateUserDto, @CurrentUser('sub') by: string) {
    return this.auth.createUser(dto, by);
  }

  @Patch('users/:id/roles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gan/sua roles nhan vien - chi ADMIN' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId cua user' })
  @ApiBody({ type: UpdateUserRolesDto, examples: { roles: { value: { roles: ['RECEIVER', 'PICKER'] } } } })
  updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser('sub') by: string,
  ) {
    return this.auth.updateRoles(id, dto.roles, by);
  }

  @Post('users/:id/lock')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Khoa tai khoan va revoke tat ca refresh token' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId cua user' })
  lockUser(@Param('id') id: string, @CurrentUser('sub') by: string) {
    return this.auth.lockUser(id, by);
  }

  @Post('users/:id/unlock')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mo khoa tai khoan' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId cua user' })
  unlockUser(@Param('id') id: string, @CurrentUser('sub') by: string) {
    return this.auth.unlockUser(id, by);
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset mat khau tam va bat doi mat khau' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId cua user' })
  @ApiBody({ type: ResetUserPasswordDto, examples: { reset: { value: { temporaryPassword: 'TempP@ssw0rd123!' } } } })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser('sub') by: string,
  ) {
    return this.auth.resetTemporaryPassword(id, dto.temporaryPassword, by);
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nhan vien doi mat khau' })
  @ApiBody({ type: ChangePasswordDto, examples: { change: { value: { oldPassword: 'TempP@ssw0rd123!', newPassword: 'NewP@ssw0rd123!' } } } })
  changePassword(@CurrentUser('sub') userId: string, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(userId, dto);
  }
}


