import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateShelfDto {
  @ApiProperty({ example: '60d5ec49f1b2c72b3c8e4f03' })
  @IsMongoId()
  rackId!: string;

  @ApiProperty({ example: 1, description: 'Số tầng (1, 2, 3...)' })
  @IsInt()
  @Min(1)
  level!: number;

  @ApiProperty({ example: 'A1-T1', description: 'Mã barcode vị trí — dán tem tại shelf' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiPropertyOptional({ example: 120, description: 'Chiều sâu lòng tầng (cm)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  innerDepth?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  innerWidth?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  innerHeight?: number;

  @ApiPropertyOptional({ example: 0.8, description: 'Override fill factor (0–1). Bỏ trống = dùng mặc định hệ thống' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fillFactor?: number;

  @ApiPropertyOptional({ default: false, description: 'true = shelf staging (khu nhận hàng tạm)' })
  @IsOptional()
  @IsBoolean()
  isStaging?: boolean;
}

export class UpdateShelfDto extends PartialType(CreateShelfDto) {}

export class ShelfResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) => obj._id?.toString())
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { rackId?: Types.ObjectId } }) => obj.rackId?.toString())
  @ApiProperty()
  rackId!: string;

  @Expose()
  @ApiProperty()
  level!: number;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiPropertyOptional()
  innerDepth?: number;

  @Expose()
  @ApiPropertyOptional()
  innerWidth?: number;

  @Expose()
  @ApiPropertyOptional()
  innerHeight?: number;

  @Expose()
  @ApiPropertyOptional()
  fillFactor?: number | null;

  @Expose()
  @ApiProperty()
  isStaging!: boolean;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
