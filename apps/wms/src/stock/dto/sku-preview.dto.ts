import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsString,
  MinLength,
} from 'class-validator';
import { ItemType } from '../schemas/warehouse-item.schema';

export class SkuPreviewDto {
  @ApiProperty({
    enum: [ItemType.CUP_BLANK, ItemType.MATERIAL, ItemType.PACKAGING],
  })
  @IsIn([ItemType.CUP_BLANK, ItemType.MATERIAL, ItemType.PACKAGING])
  type!: ItemType.CUP_BLANK | ItemType.MATERIAL | ItemType.PACKAGING;

  @ApiProperty({ example: 'MATERIAL_SYRUP' })
  @IsString()
  @MinLength(1)
  templateId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  attributeOptionIds!: string[];
}

export class SkuPreviewResponseDto {
  @Expose()
  @ApiProperty({ example: 'MAT-SYR-PEACH-750ML' })
  sku!: string;
}
