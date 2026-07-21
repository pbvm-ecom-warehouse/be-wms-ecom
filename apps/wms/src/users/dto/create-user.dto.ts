import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WmsRole } from '@app/auth';

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

  @ApiPropertyOptional({ example: WmsRole.RECEIVER, enum: WmsRole })
  @IsOptional()
  @IsIn(Object.values(WmsRole))
  role?: WmsRole;
}
