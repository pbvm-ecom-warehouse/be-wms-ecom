import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../schemas/order.schema';

export class SelectedCheckoutItemDto {
  @ApiProperty({ example: 'CUP-PP-350ML' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiPropertyOptional({
    example: 'https://storage.com/designs/marriage-cup.png',
  })
  @IsString()
  @IsOptional()
  designFile?: string;

  @ApiPropertyOptional({ example: '64abc...' })
  @IsString()
  @IsOptional()
  designId?: string;
}

export class DirectCheckoutItemDto {
  @ApiProperty({ example: 'CUP-PP-350ML' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    example: 'https://storage.com/designs/marriage-cup.png',
  })
  @IsString()
  @IsOptional()
  designFile?: string;

  @ApiPropertyOptional({ example: '64abc...' })
  @IsString()
  @IsOptional()
  designId?: string;
}

export class CheckoutDto {
  @ApiProperty({
    example: '64abc...',
    description:
      'ObjectId của địa chỉ giao hàng trong sổ địa chỉ của khách hàng',
  })
  @IsString()
  @IsNotEmpty()
  addressId: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.COD })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    type: DirectCheckoutItemDto,
    description: 'Sản phẩm mua ngay trực tiếp (dùng cho ly in không đi qua giỏ)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DirectCheckoutItemDto)
  directItem?: DirectCheckoutItemDto;

  @ApiPropertyOptional({
    type: [SelectedCheckoutItemDto],
    description: 'Danh sách các sản phẩm được chọn để mua từ giỏ hàng',
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SelectedCheckoutItemDto)
  items?: SelectedCheckoutItemDto[];
}
