import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';
import { AttributeOptionKey } from '../../schemas/attribute-option.schema';

export class QueryAttributeOptionDto {
  @ApiProperty({ enum: AttributeOptionKey })
  @IsEnum(AttributeOptionKey)
  key!: AttributeOptionKey;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  includeInactive?: boolean;
}

export class CodeSuggestionDto {
  @ApiProperty({ enum: AttributeOptionKey })
  @IsEnum(AttributeOptionKey)
  key!: AttributeOptionKey;

  @ApiProperty({ example: 'Trong suốt' })
  @IsString()
  @MinLength(1)
  name!: string;
}

export class CodeSuggestionResponseDto {
  @Expose()
  @ApiProperty({ example: 'TS' })
  code!: string;
}

export class CreateAttributeOptionDto {
  @ApiProperty({ enum: AttributeOptionKey })
  @IsEnum(AttributeOptionKey)
  key!: AttributeOptionKey;

  @ApiProperty({ example: 'Trong suốt' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'CLR' })
  @IsString()
  @MinLength(1)
  code!: string;
}

export class UpdateAttributeOptionDto {
  @ApiPropertyOptional({ example: 'Trong suốt (đã đổi tên)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class AttributeOptionResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ enum: AttributeOptionKey })
  key!: AttributeOptionKey;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty()
  isActive!: boolean;

  @Expose()
  @ApiProperty()
  sortOrder!: number;
}
