import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ASSIGNABLE_WMS_ROLES, WmsRole } from '@app/auth';

export class UpdateUserRoleDto {
  @ApiProperty({ example: WmsRole.RECEIVER, enum: ASSIGNABLE_WMS_ROLES })
  @IsIn(ASSIGNABLE_WMS_ROLES)
  role!: WmsRole;
}
