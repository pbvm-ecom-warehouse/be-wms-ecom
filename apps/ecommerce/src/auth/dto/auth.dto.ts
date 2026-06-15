import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** Đăng ký khách mới. */
export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8) // mật khẩu tối thiểu 8 ký tự
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

/** Đăng nhập khách bằng email + mật khẩu. */
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @IsString()
  refreshToken: string;
}
