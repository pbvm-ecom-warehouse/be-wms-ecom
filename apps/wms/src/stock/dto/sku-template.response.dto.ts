import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class SkuTemplateFieldResponseDto {
  @Expose()
  @ApiProperty()
  key!: string;

  @Expose()
  @ApiProperty({
    description: 'false = field optional, FE có thể để trống trên form',
  })
  required!: boolean;
}

export class SkuTemplateResponseDto {
  @Expose()
  @ApiProperty({ example: 'template' })
  kind!: 'template';

  @Expose()
  @ApiProperty()
  templateId!: string;

  @Expose()
  @ApiProperty()
  itemType!: string;

  @Expose()
  @ApiPropertyOptional()
  category?: string | null;

  @Expose()
  @ApiProperty()
  prefix!: string;

  @Expose()
  @Type(() => SkuTemplateFieldResponseDto)
  @ApiProperty({ type: [SkuTemplateFieldResponseDto] })
  fields!: SkuTemplateFieldResponseDto[];
}
