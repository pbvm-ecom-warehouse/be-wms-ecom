import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { Expose, Transform } from 'class-transformer';
import { Types } from 'mongoose';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Ly nhựa' })
  @IsString()
  @IsNotEmpty()
  name: string;

  /** slug phải là lowercase-kebab, dùng cho URL */
  @ApiProperty({ example: 'ly-nhua' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug phải là lowercase-kebab-case' })
  slug: string;

  @ApiPropertyOptional({ example: null, description: 'null = root category' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  position?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) => obj._id?.toString())
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  slug!: string;

  @Expose()
  @Transform(({ obj }: { obj: { parentId?: Types.ObjectId | null } }) => obj.parentId?.toString() ?? null)
  parentId!: string | null;

  @Expose()
  position!: number;
}
