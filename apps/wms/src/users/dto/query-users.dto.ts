import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OffsetPaginationQuery } from '@app/common';
import { WmsRole } from '@app/auth';
import { UserStatus } from '../schemas/user.schema';

export class QueryUsersDto extends OffsetPaginationQuery {
  @ApiPropertyOptional({ enum: WmsRole })
  @IsOptional()
  @IsEnum(WmsRole)
  role?: WmsRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Mongo ObjectId của kho' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo username, name hoặc email' })
  @IsOptional()
  @IsString()
  search?: string;
}
