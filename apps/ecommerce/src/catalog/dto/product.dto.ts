import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ProductStatus } from '../schemas/product.schema';
import { FulfillmentType } from '../schemas/product-variant.schema';

export class SeoDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  keywords?: string[];
}

export class CreateProductDto {
  @ApiProperty({ example: 'Ly nhựa in custom' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'ly-nhua-in-custom' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug phải là lowercase-kebab-case',
  })
  slug: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  images?: string[];

  @ApiProperty({ example: '64abc...' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  seo?: SeoDto;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class CreateVariantDto {
  @ApiProperty({ example: 'CUP-PP-350ML' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ example: '64abc...' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ example: { size: '350ml' } })
  @IsObject()
  @IsOptional()
  attributes?: Record<string, string>;

  @ApiProperty({ example: 12000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ enum: FulfillmentType })
  @IsEnum(FulfillmentType)
  @IsOptional()
  fulfillmentType?: FulfillmentType;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}

export class ProductQueryDto {
  @ApiPropertyOptional({ example: 'ly' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ example: '64abc...' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: 10000 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 100000 })
  @IsNumber()
  @IsOptional()
  maxPrice?: number;

  /** Chỉ lấy sản phẩm còn hàng (availableQty > 0 ít nhất 1 variant) */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  inStock?: boolean | string;
}
export class ProductVariantResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  id!: string;

  @Expose()
  sku!: string;

  @Expose()
  @Transform(({ obj }: { obj: { productId?: Types.ObjectId } }) =>
    obj.productId?.toString(),
  )
  productId!: string;

  @Expose()
  attributes!: Record<string, string>;

  @Expose()
  price!: number;

  @Expose()
  availableQty!: number;

  @Expose()
  fulfillmentType!: FulfillmentType;

  @Expose()
  isActive!: boolean;
}
export class ProductResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  slug!: string;

  @Expose()
  description!: string;

  @Expose()
  images!: string[];

  @Expose()
  @Transform(({ obj }: { obj: { categoryId?: Types.ObjectId } }) =>
    obj.categoryId?.toString(),
  )
  categoryId!: string;

  @Expose()
  status!: ProductStatus;

  @Expose()
  seo!: SeoDto;

  @Expose()
  @ApiProperty({ example: 10000 })
  price!: number;

  @Expose()
  @ApiProperty({ example: true })
  inStock!: boolean;

  @Expose()
  @Type(() => ProductVariantResponseDto)
  @ApiProperty({ type: [ProductVariantResponseDto] })
  variants!: ProductVariantResponseDto[];
}

export class ProductDetailResponseDto extends ProductResponseDto {}

export class ImageUploadResponseDto {
  @Expose()
  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/ecom/products/x.jpg',
  })
  url!: string;
}
