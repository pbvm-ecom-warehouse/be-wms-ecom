import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WmsRole } from '@app/auth';

/** ÄÄƒng nháº­p nhĂ¢n viĂªn báº±ng username + máº­t kháº©u. */
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

/** Äá»•i access token má»›i báº±ng refresh token. */
export class RefreshDto {
  @ApiProperty({ description: 'Refresh token nháº­n Ä‘Æ°á»£c lĂºc login' })
  @IsString()
  refreshToken!: string;
}

/** ÄÄƒng xuáº¥t: thu há»“i refresh token Ä‘ang giá»¯. */
export class LogoutDto {
  @ApiProperty({ description: 'Refresh token cáº§n thu há»“i' })
  @IsString()
  refreshToken!: string;
}

/** Táº¡o nhĂ¢n viĂªn (ADMIN) hoáº·c khá»Ÿi táº¡o admin Ä‘áº§u tiĂªn (bootstrap). */
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

  @ApiPropertyOptional({ example: 'Nguyá»…n VÄƒn A' })
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
