import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
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

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  xM?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  yM?: number;

  @ApiPropertyOptional({ example: 0, enum: [0, 90] })
  @IsOptional()
  @IsIn([0, 90])
  rotation?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  accessPointXM?: number;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsNumber()
  accessPointYM?: number;
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
  xM!: number;

  @Expose()
  @ApiProperty()
  yM!: number;

  @Expose()
  @ApiProperty({ enum: [0, 90] })
  rotation!: number;

  @Expose()
  @ApiProperty()
  accessPointXM!: number;

  @Expose()
  @ApiProperty()
  accessPointYM!: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
