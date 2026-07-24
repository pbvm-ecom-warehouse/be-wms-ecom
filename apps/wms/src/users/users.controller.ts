import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  WmsRole,
} from '@app/auth';
import { buildOffsetMeta, PaginatedResult } from '@app/common';
import { plainToInstance } from 'class-transformer';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import {
  CreateUserResponseDto,
  UserResponseDto,
} from './dto/user.response.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(WmsRole.ADMIN, WmsRole.MANAGER)
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách nhân viên — [ADMIN, MANAGER]' })
  @ApiOkResponse({ type: [UserResponseDto] })
  async list(
    @Query() query: QueryUsersDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    const { items, total } = await this.svc.list(query);
    const data = plainToInstance(UserResponseDto, items, TO_OPTS);
    return new PaginatedResult(
      data,
      buildOffsetMeta(data.length, query.page, query.limit, total),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết nhân viên — [ADMIN, MANAGER]' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiOkResponse({ type: UserResponseDto })
  async getById(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.svc.getById(id);
    return plainToInstance(UserResponseDto, user, TO_OPTS);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo nhân viên mới — [ADMIN, MANAGER]' })
  @ApiCreatedResponse({ type: CreateUserResponseDto })
  @ApiConflictResponse({
    description:
      'username hoặc email đã tồn tại (error.code: USER_USERNAME_EXISTS | USER_EMAIL_EXISTS)',
  })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: { sub: string; role: string },
  ): Promise<CreateUserResponseDto> {
    const user = await this.svc.create(dto, actor);
    return plainToInstance(CreateUserResponseDto, user, TO_OPTS);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Sửa hồ sơ nhân viên (name/email) — [ADMIN, MANAGER]',
  })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiOkResponse({ type: UserResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: { sub: string; role: string },
  ): Promise<UserResponseDto> {
    const user = await this.svc.update(id, dto, actor);
    return plainToInstance(UserResponseDto, user, TO_OPTS);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Đổi role nhân viên — [ADMIN, MANAGER]' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiOkResponse({ type: UserResponseDto })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: { sub: string; role: string },
  ): Promise<UserResponseDto> {
    const user = await this.svc.updateRole(id, dto.role, actor);
    return plainToInstance(UserResponseDto, user, TO_OPTS);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khóa tài khoản và revoke tất cả refresh token — [ADMIN, MANAGER]',
  })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiOkResponse({ type: UserResponseDto })
  async lock(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; role: string },
  ): Promise<UserResponseDto> {
    const user = await this.svc.lock(id, actor);
    return plainToInstance(UserResponseDto, user, TO_OPTS);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mở khóa tài khoản — [ADMIN, MANAGER]' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiOkResponse({ type: UserResponseDto })
  async unlock(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; role: string },
  ): Promise<UserResponseDto> {
    const user = await this.svc.unlock(id, actor);
    return plainToInstance(UserResponseDto, user, TO_OPTS);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset mật khẩu tạm và bắt đổi mật khẩu — [ADMIN, MANAGER]',
  })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiOkResponse({ description: '{ success: true, mustChangePassword: true }' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() actor: { sub: string; role: string },
  ): Promise<{ success: boolean; mustChangePassword: boolean }> {
    return this.svc.resetPassword(id, dto.temporaryPassword, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa nhân viên (soft-delete) — [ADMIN, MANAGER]' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId của user' })
  @ApiNoContentResponse()
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; role: string },
  ): Promise<void> {
    await this.svc.remove(id, actor);
  }
}
