import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';
import { CarrierStatus } from '../schemas/carrier.schema';

export class CreateCarrierDto {
  @ApiProperty({ example: 'Giao Hàng Nhanh' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'GHN' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiPropertyOptional({ example: { phone: '1900636677' } })
  @IsOptional()
  @IsObject()
  contactInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCarrierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  contactInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ enum: CarrierStatus })
  @IsOptional()
  @IsEnum(CarrierStatus)
  status?: CarrierStatus;
}

export class QueryCarrierDto {
  @ApiPropertyOptional({ enum: CarrierStatus })
  @IsOptional()
  @IsEnum(CarrierStatus)
  status?: CarrierStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CarrierResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty({ enum: CarrierStatus })
  status!: CarrierStatus;

  @Expose()
  @ApiPropertyOptional()
  contactInfo?: Record<string, unknown>;

  @Expose()
  @ApiPropertyOptional()
  note?: string;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
