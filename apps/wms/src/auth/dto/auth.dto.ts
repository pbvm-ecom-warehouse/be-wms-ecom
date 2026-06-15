import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WmsRole } from '@app/auth';

/** Đăng nhập nhân viên bằng username + mật khẩu. */
export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'P@ssw0rd!', minLength: 1 })
  @IsString()
  @MinLength(1)
  password: string;
}

/** Đổi access token mới bằng refresh token. */
export class RefreshDto {
  @ApiProperty({ description: 'Refresh token nhận được lúc login' })
  @IsString()
  refreshToken: string;
}

/** Đăng xuất: thu hồi refresh token đang giữ. */
export class LogoutDto {
  @ApiProperty({ description: 'Refresh token cần thu hồi' })
  @IsString()
  refreshToken: string;
}

/** Tạo nhân viên (ADMIN) hoặc khởi tạo admin đầu tiên (bootstrap). */
export class CreateUserDto {
  @ApiProperty({ example: 'nguyen.van.a', minLength: 3 })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

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
