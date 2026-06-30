import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WmsRole } from '@app/auth';
import { Types } from 'mongoose';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  username!: string;

  @ApiProperty({ example: 'P@ssw0rd!', minLength: 1 })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class GoogleLoginDto {
  @ApiProperty({ description: 'Firebase ID token lấy từ Google sign-in' })
  @IsString()
  idToken!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Refresh token nhận được lúc login — bỏ qua nếu dùng cookie mode',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token cần thu hồi — bỏ qua nếu dùng cookie mode',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'nguyen.van.a', minLength: 3 })
  @IsString()
  @MinLength(3)
  username!: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'staff@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: [WmsRole.RECEIVER],
    enum: WmsRole,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(Object.values(WmsRole), { each: true })
  roles?: string[];
}

export class UpdateUserRolesDto {
  @ApiProperty({ example: [WmsRole.RECEIVER], enum: WmsRole, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(Object.values(WmsRole), { each: true })
  roles!: string[];
}

export class ResetUserPasswordDto {
  @ApiProperty({ example: 'TempP@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  temporaryPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldP@ssw0rd123!' })
  @IsString()
  @MinLength(1)
  oldPassword!: string;

  @ApiProperty({ example: 'NewP@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Response cho login / google-login / refresh. */
export class AuthTokenResponseDto {
  @Expose()
  @ApiProperty()
  accessToken!: string;

  @Expose()
  @ApiProperty()
  refreshToken!: string;

  @Expose()
  @ApiProperty()
  mustChangePassword!: boolean;
}

/** Response cho GET /me, PATCH /users/:id/roles, POST /users/:id/lock|unlock. */
export class UserResponseDto {
  @Expose()
  @Transform(
    ({ obj }: { obj: { _id?: Types.ObjectId | { toString(): string } } }) =>
      obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  username!: string;

  @Expose()
  @ApiPropertyOptional()
  email?: string;

  @Expose()
  @ApiPropertyOptional()
  name?: string;

  @Expose()
  @ApiProperty({ enum: WmsRole, isArray: true })
  roles!: string[];

  @Expose()
  @ApiProperty({ enum: ['ACTIVE', 'LOCKED'] })
  status!: string;

  @Expose()
  @ApiProperty()
  mustChangePassword!: boolean;

  @Expose()
  @Transform(
    ({
      obj,
    }: {
      obj: { warehouseId?: Types.ObjectId | { toString(): string } | null };
    }) => obj.warehouseId?.toString() ?? undefined,
  )
  @ApiPropertyOptional()
  warehouseId?: string;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}

/** Response cho POST /users và POST /bootstrap-admin. */
export class CreateUserResponseDto {
  @Expose()
  @Transform(
    ({ obj }: { obj: { _id?: Types.ObjectId | { toString(): string } } }) =>
      obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  username!: string;

  @Expose()
  @ApiPropertyOptional()
  email?: string;

  @Expose()
  @ApiProperty({ enum: WmsRole, isArray: true })
  roles!: string[];

  @Expose()
  @ApiProperty()
  mustChangePassword!: boolean;
}
