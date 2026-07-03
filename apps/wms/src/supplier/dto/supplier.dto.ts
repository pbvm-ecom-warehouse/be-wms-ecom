import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Types } from 'mongoose';
import { SupplierStatus } from '../schemas/supplier.schema';

export class CreateSupplierDto {
  @ApiProperty({
    example: 'NCC-001',
    description: 'Mã NCC — unique, không đổi sau khi có PO',
  })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Công ty TNHH ABC' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@abc.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '123 Lê Văn Lương, Q7' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '0300123456' })
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiPropertyOptional({ example: 'Ưu tiên đặt hàng quý 1' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class ChangeSupplierStatusDto {
  @ApiProperty({ enum: SupplierStatus, example: SupplierStatus.INACTIVE })
  @IsEnum(SupplierStatus)
  status!: SupplierStatus;
}

export class QuerySupplierDto {
  @ApiPropertyOptional({ enum: SupplierStatus })
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;

  @ApiPropertyOptional({ description: 'Tìm theo name hoặc code' })
  @IsOptional()
  @IsString()
  search?: string;

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

export class SupplierResponseDto {
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
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiPropertyOptional()
  contactName?: string;

  @Expose()
  @ApiPropertyOptional()
  phone?: string;

  @Expose()
  @ApiPropertyOptional()
  email?: string;

  @Expose()
  @ApiPropertyOptional()
  address?: string;

  @Expose()
  @ApiPropertyOptional()
  taxCode?: string;

  @Expose()
  @ApiProperty({ enum: SupplierStatus })
  status!: SupplierStatus;

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
