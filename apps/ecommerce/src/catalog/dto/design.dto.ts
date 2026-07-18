import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Expose, Transform } from 'class-transformer';
import { Types } from 'mongoose';

export class CreateDesignDto {
  @ApiProperty({ example: 'Logo công ty ABC' })
  @IsString()
  @IsNotEmpty()
  name: string;

  /** URL file artwork sau khi đã upload lên storage */
  @ApiProperty({ example: 'https://storage.example.com/designs/abc.png' })
  @IsString()
  @IsNotEmpty()
  file: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/thumbnails/abc.jpg',
  })
  @IsString()
  @IsOptional()
  thumbnail?: string;
}

export class DesignResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { customerId?: Types.ObjectId } }) =>
    obj.customerId?.toString(),
  )
  customerId!: string;

  @Expose()
  name!: string;

  @Expose()
  file!: string;

  @Expose()
  thumbnail!: string;

  @Expose()
  lastUsedAt!: Date | null;
}

export class UpdateDesignDto {
  @ApiPropertyOptional({ example: 'Logo công ty ABC (Updated)' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/designs/abc-updated.png' })
  @IsString()
  @IsOptional()
  file?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/thumbnails/abc-updated.jpg',
  })
  @IsString()
  @IsOptional()
  thumbnail?: string;
}
