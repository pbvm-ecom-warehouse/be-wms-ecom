import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsNumber,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class AssignInventoryCellDto {
  @ApiProperty()
  @IsMongoId()
  inventoryId!: string;

  @ApiProperty({ example: 'R01-T1-B2' })
  @IsString()
  @MinLength(1)
  cellBarcode!: string;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  packageCount!: number;

  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  packageFactor!: number;

  @ApiProperty({ example: 40 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  packageDepthCm!: number;

  @ApiProperty({ example: 30 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  packageWidthCm!: number;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  packageHeightCm!: number;

  @ApiProperty({ example: 24000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  packageVolumeCm3!: number;
}
