import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WmsRole } from '@app/auth';

export class UpdateUserRoleDto {
  @ApiProperty({ example: WmsRole.RECEIVER, enum: WmsRole })
  @IsIn(Object.values(WmsRole))
  role!: WmsRole;
}
