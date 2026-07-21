import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
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

export class CreateEcomManagerDto {
  @ApiProperty({ example: 'manager2@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'Nguyen Van Manager' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0901234568' })
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

export class GoogleLoginDto {
  @ApiProperty({ description: 'Firebase ID token lấy từ Google sign-in' })
  @IsString()
  idToken!: string;
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

export class VerifyEmailDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456', description: 'Mã OTP 6 số' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456', description: 'Mã OTP 6 số' })
  @IsString()
  @Length(6, 6)
  code!: string;

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

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class AuthTokenResponseDto {
  @Expose()
  @ApiProperty()
  accessToken!: string;

  @Expose()
  @ApiProperty()
  refreshToken!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Email đã xác minh hay chưa' })
  emailVerified?: boolean;
}

export class AddressResponseDto {
  @Expose()
  @ApiProperty()
  @Transform(({ obj }: { obj: { _id?: { toString(): string } } }) =>
    obj._id?.toString(),
  )
  id!: string;

  @Expose()
  @ApiProperty({ example: 'Home' })
  label!: string;

  @Expose()
  @ApiProperty({ example: 'Nguyen Thi B' })
  recipientName!: string;

  @Expose()
  @ApiProperty({ example: '0901234567' })
  phone!: string;

  @Expose()
  @ApiProperty({ example: '123 Nguyen Trai' })
  line!: string;

  @Expose()
  @ApiProperty({ example: 'Ward 1' })
  ward!: string;

  @Expose()
  @ApiProperty({ example: 'District 1' })
  district!: string;

  @Expose()
  @ApiProperty({ example: 'Ho Chi Minh' })
  province!: string;

  @Expose()
  @ApiProperty({ example: false })
  isDefault!: boolean;
}

export class UserResponseDto {
  @Expose()
  @ApiProperty()
  @Transform(({ obj }: { obj: { _id?: { toString(): string } } }) =>
    obj._id?.toString(),
  )
  id!: string;

  @Expose()
  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @Expose()
  @ApiPropertyOptional({ example: 'Nguyen Thi B' })
  name?: string;

  @Expose()
  @ApiPropertyOptional({ example: '0901234567' })
  phone?: string;

  @Expose()
  @ApiProperty({ example: false })
  emailVerified!: boolean;

  @Expose()
  @ApiProperty({ enum: ['ACTIVE', 'LOCKED'], example: 'ACTIVE' })
  status!: string;

  @Expose()
  @ApiProperty({ enum: ['customer', 'admin'], example: 'customer' })
  type!: string;

  @Expose()
  @ApiProperty({ type: [String], example: [] })
  roles!: string[];

  @Expose()
  @Type(() => AddressResponseDto)
  @ApiProperty({ type: [AddressResponseDto] })
  addresses!: AddressResponseDto[];
}

export class SuccessResponseDto {
  @Expose()
  @ApiPropertyOptional({ example: true })
  success?: boolean;

  @Expose()
  @ApiPropertyOptional()
  message?: string;

  @Expose()
  @ApiPropertyOptional({ example: false })
  emailVerified?: boolean;
}

export class SaveFcmTokenDto {
  @ApiProperty({ description: 'FCM Token thiết bị di động / trình duyệt lấy từ Firebase Messaging' })
  @IsString()
  fcmToken!: string;

  @ApiPropertyOptional({ example: 'mobile', description: 'Loại thiết bị: mobile, web, ios, android' })
  @IsOptional()
  @IsString()
  deviceType?: string;
}

export class DeleteFcmTokenDto {
  @ApiProperty({ description: 'FCM Token cần xóa' })
  @IsString()
  fcmToken!: string;
}

