import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { AttributeOptionResponseDto } from '../attribute-option/dto/attribute-option.dto';

export class SkuTemplateFieldResponseDto {
  @Expose()
  @ApiProperty()
  key!: string;
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

export class SkuCategoryOptionsResponseDto {
  @Expose()
  @ApiProperty({ example: 'category-options' })
  kind!: 'category-options';

  @Expose()
  @ApiProperty()
  categoryKey!: string;

  @Expose()
  @Type(() => AttributeOptionResponseDto)
  @ApiProperty({ type: [AttributeOptionResponseDto] })
  options!: AttributeOptionResponseDto[];
}
