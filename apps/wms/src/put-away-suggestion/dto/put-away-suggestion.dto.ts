import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class QueryPutAwaySuggestionDto {
  @ApiProperty({ example: 'CUP-500ML-RED' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 5, description: 'Số thùng cần tìm vị trí' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  lotId?: string;

  @ApiPropertyOptional({ example: 24000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  packageVolumeCm3?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  packageDepthCm?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  packageWidthCm?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  packageHeightCm?: number;
}

export class NavigationPointDto {
  @Expose()
  @ApiProperty()
  xM!: number;

  @Expose()
  @ApiProperty()
  yM!: number;
}

export class NavigationPathDto {
  @Expose()
  @ApiProperty()
  startGateCode!: string;

  @Expose()
  @ApiProperty()
  targetRackId!: string;

  @Expose()
  @Type(() => NavigationPointDto)
  @ApiProperty({ type: [NavigationPointDto] })
  points!: NavigationPointDto[];

  @Expose()
  @ApiProperty()
  distanceM!: number;
}

export class PutAwaySuggestionItemDto {
  @Expose()
  @ApiProperty()
  shelfCode!: string;

  @Expose()
  @ApiProperty()
  capacity!: number;

  @Expose()
  @ApiProperty()
  cellId!: string;

  @Expose()
  @ApiProperty()
  cellCode!: string;

  @Expose()
  @ApiProperty()
  rackId!: string;

  @Expose()
  @ApiProperty()
  level!: number;

  @Expose()
  @ApiProperty()
  bay!: number;

  @Expose()
  @ApiProperty()
  fillPercent!: number;

  @Expose()
  @ApiProperty()
  reason!: string;

  @Expose()
  @Type(() => NavigationPathDto)
  @ApiProperty({ type: NavigationPathDto })
  path!: NavigationPathDto;
}

export class PutAwaySuggestionResponseDto {
  @Expose()
  @Type(() => PutAwaySuggestionItemDto)
  @ApiProperty({ type: [PutAwaySuggestionItemDto] })
  suggestions!: PutAwaySuggestionItemDto[];

  @Expose()
  @ApiPropertyOptional({
    enum: [
      'ITEM_NO_DIMENSIONS',
      'NO_SHELF_FITS',
      'INSUFFICIENT_CAPACITY',
      'NO_NAVIGATION_PATH',
    ],
    nullable: true,
  })
  warning!: string | null;
}
