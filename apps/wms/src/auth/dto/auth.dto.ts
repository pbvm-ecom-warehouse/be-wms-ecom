import { IsOptional, IsString, MinLength } from 'class-validator';
import { Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
