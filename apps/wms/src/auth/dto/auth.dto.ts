import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { WmsRole } from '@app/auth';

/** Đăng nhập nhân viên bằng username + mật khẩu. */
export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(1)
  password: string;
}

/** Đổi access token mới bằng refresh token. */
export class RefreshDto {
  @IsString()
  refreshToken: string;
}

/** Đăng xuất: thu hồi refresh token đang giữ. */
export class LogoutDto {
  @IsString()
  refreshToken: string;
}

/** Tạo nhân viên (ADMIN) hoặc khởi tạo admin đầu tiên (bootstrap). */
export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(8) // mật khẩu tối thiểu 8 ký tự
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(Object.values(WmsRole), { each: true })
  roles?: string[];
}
