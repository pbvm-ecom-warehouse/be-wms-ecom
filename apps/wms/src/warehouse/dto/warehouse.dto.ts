import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { Types } from 'mongoose';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Kho trung tâm' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: '123 Nguyễn Văn Linh, Q7, TP.HCM' })
  @IsString()
  @MinLength(1)
  address!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}

export class WarehouseResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) => obj._id?.toString())
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  address!: string;

  @Expose()
  @ApiProperty()
  isActive!: boolean;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
