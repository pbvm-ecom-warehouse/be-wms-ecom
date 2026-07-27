import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Types } from 'mongoose';
import { AisleType } from '../schemas/aisle.schema';

export class CreateAisleDto {
  @ApiProperty({ example: 'MAIN-01' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ enum: AisleType, example: AisleType.MAIN })
  @IsEnum(AisleType)
  type!: AisleType;

  @ApiPropertyOptional({ example: 18 })
  @IsOptional()
  @IsNumber()
  xM?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  yM?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  widthM?: number;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsNumber()
  heightM?: number;
}

export class UpdateAisleDto extends PartialType(CreateAisleDto) {}

export class AisleResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty({ enum: AisleType })
  type!: AisleType;

  @Expose()
  @ApiProperty()
  xM!: number;

  @Expose()
  @ApiProperty()
  yM!: number;

  @Expose()
  @ApiProperty()
  widthM!: number;

  @Expose()
  @ApiProperty()
  heightM!: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
