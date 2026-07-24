import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class QueryPutAwaySuggestionDto {
  @ApiProperty({ example: 'CUP-500ML-RED' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class PutAwaySuggestionItemDto {
  @Expose()
  @ApiProperty()
  shelfCode!: string;

  @Expose()
  @ApiProperty()
  capacity!: number;
}

export class PutAwaySuggestionResponseDto {
  @Expose()
  @ApiProperty({ type: [PutAwaySuggestionItemDto] })
  suggestions!: PutAwaySuggestionItemDto[];

  @Expose()
  @ApiPropertyOptional({
    enum: ['ITEM_NO_DIMENSIONS', 'NO_SHELF_FITS', 'INSUFFICIENT_CAPACITY'],
    nullable: true,
    description:
      'null nếu có gợi ý hợp lệ, ngược lại giải thích lý do không gợi ý được',
  })
  warning!: string | null;
}
