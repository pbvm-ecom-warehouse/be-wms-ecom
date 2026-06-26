import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { CartStatus } from '../schemas/cart.schema';

export class AddCartItemDto {
  @ApiProperty({ example: 'CUP-PP-350ML' })
  @IsString() @IsNotEmpty()
  sku: string;

  @ApiProperty({ example: 2 })
  @IsInt() @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: '64abc...' })
  @IsString() @IsOptional()
  designId?: string;

  @ApiPropertyOptional({ example: 'https://storage.com/designs/marriage-cup.png' })
  @IsString() @IsOptional()
  designFile?: string;
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 5 })
  @IsInt() @Min(1)
  quantity: number;
}

export class CartItemResponseDto {
  @Expose()
  sku!: string;

  @Expose()
  quantity!: number;

  @Expose()
  isPrintItem!: boolean;

  @Expose()
  designId!: string | null;

  @Expose()
  designFile!: string | null;

  @Expose()
  unitPrice!: number;
}

export class CartResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) => obj._id?.toString())
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { customerId?: Types.ObjectId } }) => obj.customerId?.toString())
  customerId!: string;

  @Expose()
  status!: CartStatus;

  @Expose()
  @Type(() => CartItemResponseDto)
  items!: CartItemResponseDto[];
}
