import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsMongoId, IsString, MinLength } from 'class-validator';
import { Types } from 'mongoose';

export class CreateRackDto {
  @ApiProperty({ example: '60d5ec49f1b2c72b3c8e4f02' })
  @IsMongoId()
  zoneId!: string;

  @ApiProperty({ example: 'Kệ A1' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'A1' })
  @IsString()
  @MinLength(1)
  code!: string;
}

export class UpdateRackDto extends PartialType(CreateRackDto) {}

export class RackResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { zoneId?: Types.ObjectId } }) =>
    obj.zoneId?.toString(),
  )
  @ApiProperty()
  zoneId!: string;

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
