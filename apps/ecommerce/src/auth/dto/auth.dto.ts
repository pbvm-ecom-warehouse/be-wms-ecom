import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'Nguyen Thi B' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 1 })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token nhan duoc luc login/register' })
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token can thu hoi' })
  @IsString()
  refreshToken!: string;
}

export class TokenDto {
  @ApiProperty({ description: 'Opaque token trong email link' })
  @IsString()
  token!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ example: 'NewP@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
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

export class AddressDto {
  @ApiProperty({ example: 'Home' })
  @IsString()
  label!: string;

  @ApiProperty({ example: 'Nguyen Thi B' })
  @IsString()
  recipientName!: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  phone!: string;

  @ApiProperty({ example: '123 Nguyen Trai' })
  @IsString()
  line!: string;

  @ApiProperty({ example: 'Ward 1' })
  @IsString()
  ward!: string;

  @ApiProperty({ example: 'District 1' })
  @IsString()
  district!: string;

  @ApiProperty({ example: 'Ho Chi Minh' })
  @IsString()
  province!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'Nguyen Thi B' })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '123 Nguyen Trai' })
  @IsOptional()
  @IsString()
  line?: string;

  @ApiPropertyOptional({ example: 'Ward 1' })
  @IsOptional()
  @IsString()
  ward?: string;

  @ApiPropertyOptional({ example: 'District 1' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 'Ho Chi Minh' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
