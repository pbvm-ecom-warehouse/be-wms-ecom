import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WmsRole } from '@app/auth';
import { Types } from 'mongoose';

/** Response cho GET /me, GET /users, GET /users/:id, PATCH /users/:id(/role), POST /users/:id/lock|unlock. */
export class UserResponseDto {
  @Expose()
  @Transform(
    ({ obj }: { obj: { _id?: Types.ObjectId | { toString(): string } } }) =>
      obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  username!: string;

  @Expose()
  @ApiPropertyOptional()
  email?: string;

  @Expose()
  @ApiPropertyOptional()
  name?: string;

  @Expose()
  @ApiProperty({ enum: WmsRole })
  role!: string;

  @Expose()
  @ApiProperty({ enum: ['ACTIVE', 'LOCKED'] })
  status!: string;

  @Expose()
  @ApiProperty()
  mustChangePassword!: boolean;

  @Expose()
  @Transform(
    ({
      obj,
    }: {
      obj: { warehouseId?: Types.ObjectId | { toString(): string } | null };
    }) => obj.warehouseId?.toString() ?? undefined,
  )
  @ApiPropertyOptional()
  warehouseId?: string;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}

/** Response cho POST /users và POST /auth/bootstrap-admin. */
export class CreateUserResponseDto {
  @Expose()
  @Transform(
    ({ obj }: { obj: { _id?: Types.ObjectId | { toString(): string } } }) =>
      obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  username!: string;

  @Expose()
  @ApiPropertyOptional()
  email?: string;

  @Expose()
  @ApiProperty({ enum: WmsRole })
  role!: string;

  @Expose()
  @ApiProperty()
  mustChangePassword!: boolean;
}
