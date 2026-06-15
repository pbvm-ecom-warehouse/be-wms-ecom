import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Đăng ký khách mới. */
export class RegisterDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'Nguyễn Thị B' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;
}

/** Đăng nhập khách bằng email + mật khẩu. */
export class LoginDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 1 })
  @IsString()
  @MinLength(1)
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token nhận được lúc login/register' })
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token cần thu hồi' })
  @IsString()
  refreshToken: string;
}
