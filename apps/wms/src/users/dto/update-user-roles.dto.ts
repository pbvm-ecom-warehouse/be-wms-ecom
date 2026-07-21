import { ArrayNotEmpty, IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WmsRole } from '@app/auth';

export class UpdateUserRolesDto {
  @ApiProperty({ example: [WmsRole.RECEIVER], enum: WmsRole, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(Object.values(WmsRole), { each: true })
  roles!: string[];
}
