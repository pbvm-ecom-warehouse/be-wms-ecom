import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsMongoId, IsString, MinLength } from 'class-validator';
import { Types } from 'mongoose';

export class CreateZoneDto {
  @ApiProperty({ example: '60d5ec49f1b2c72b3c8e4f01' })
  @IsMongoId()
  warehouseId!: string;

  @ApiProperty({ example: 'Khu A' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'A' })
  @IsString()
  @MinLength(1)
  code!: string;
}

export class UpdateZoneDto extends PartialType(CreateZoneDto) {}

export class ZoneResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { warehouseId?: Types.ObjectId } }) =>
    obj.warehouseId?.toString(),
  )
  @ApiProperty()
  warehouseId!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
