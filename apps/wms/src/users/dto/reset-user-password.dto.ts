import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetUserPasswordDto {
  @ApiProperty({ example: 'TempP@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  temporaryPassword!: string;
}
