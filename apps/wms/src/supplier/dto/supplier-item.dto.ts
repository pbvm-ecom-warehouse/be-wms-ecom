import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateSupplierItemDto {
  @ApiProperty({ description: 'WarehouseItem._id (ObjectId)', example: '665f...' })
  @IsMongoId()
  itemId!: string;

  @ApiProperty({ description: 'Supplier._id (ObjectId)', example: '665f...' })
  @IsMongoId()
  supplierId!: string;

  @ApiPropertyOptional({ description: 'Mã hàng phía NCC để đối chiếu khi đặt hàng' })
  @IsOptional()
  @IsString()
  supplierItemCode?: string;

  @ApiProperty({ example: 15000, description: 'Giá nhập gợi ý (VND)' })
  @IsNumber()
  @Min(0)
  purchasePrice!: number;

  @ApiPropertyOptional({ example: 7, description: 'Số ngày giao dự kiến' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: 100, description: 'Số lượng đặt tối thiểu (MOQ)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderQty?: number;
}

export class UpdateSupplierItemDto {
  @ApiPropertyOptional({ description: 'Đổi NCC chính cho SKU này' })
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierItemCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderQty?: number;

  @ApiPropertyOptional({ description: 'false = hết hiệu lực báo giá' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SupplierItemResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) => obj._id?.toString())
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { itemId?: Types.ObjectId } }) => obj.itemId?.toString())
  @ApiProperty()
  itemId!: string;

  @Expose()
  @Transform(({ obj }: { obj: { supplierId?: Types.ObjectId } }) => obj.supplierId?.toString())
  @ApiProperty()
  supplierId!: string;

  @Expose()
  @ApiPropertyOptional()
  supplierItemCode?: string;

  @Expose()
  @ApiProperty()
  purchasePrice!: number;

  @Expose()
  @ApiPropertyOptional()
  leadTimeDays?: number;

  @Expose()
  @ApiPropertyOptional()
  minOrderQty?: number;

  @Expose()
  @ApiProperty()
  isActive!: boolean;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
