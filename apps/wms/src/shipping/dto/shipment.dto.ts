import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';
import { ShipmentStatus } from '../schemas/shipment.schema';

export class AssignShipmentDto {
  @ApiProperty({ description: 'ObjectId của carrier (phải đang ACTIVE)' })
  @IsMongoId()
  carrierId!: string;

  @ApiProperty({ example: 'GHN123456789' })
  @IsString()
  @MinLength(1)
  trackingNumber!: string;
}

export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc có ý nghĩa khi status=FAILED' })
  @IsOptional()
  @IsString()
  failReason?: string;
}

/**
 * Request DTO cho PATCH :id/status dạng multipart/form-data — cần multipart vì
 * chuyển sang DELIVERED có thể kèm ảnh POD (field `images`, xem controller).
 * Multipart form field luôn là string nên giữ nguyên shape JSON gốc.
 */
export class UpdateShipmentStatusFormDto {
  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc có ý nghĩa khi status=FAILED' })
  @IsOptional()
  @IsString()
  failReason?: string;
}

export class QueryShipmentDto {
  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  carrierId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class ShipmentStatusHistoryResponseDto {
  @Expose()
  @ApiProperty({ enum: ShipmentStatus })
  status!: ShipmentStatus;

  @Expose()
  @ApiProperty()
  at!: Date;

  @Expose()
  @Transform(({ obj }: { obj: { by?: Types.ObjectId } }) => obj.by?.toString())
  @ApiPropertyOptional()
  by?: string;

  @Expose()
  @ApiPropertyOptional()
  note?: string;

  @Expose()
  @ApiProperty({ type: [String] })
  images!: string[];
}

export class ShipmentResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  orderId!: string;

  @Expose()
  @Transform(({ obj }: { obj: { goodsIssueId?: Types.ObjectId } }) =>
    obj.goodsIssueId?.toString(),
  )
  @ApiProperty()
  goodsIssueId!: string;

  @Expose()
  @Transform(({ obj }: { obj: { carrierId?: Types.ObjectId } }) =>
    obj.carrierId?.toString(),
  )
  @ApiPropertyOptional()
  carrierId?: string;

  @Expose()
  @ApiPropertyOptional()
  trackingNumber?: string;

  @Expose()
  @ApiProperty({ enum: ShipmentStatus })
  shipmentStatus!: ShipmentStatus;

  @Expose()
  @ApiProperty()
  recipient!: { name: string; phone: string; address: Record<string, unknown> };

  @Expose()
  @ApiProperty({ enum: ['COD', 'ONLINE'] })
  paymentMethod!: 'COD' | 'ONLINE';

  @Expose()
  @ApiProperty()
  codAmount!: number;

  @Expose()
  @ApiProperty()
  attempts!: number;

  @Expose()
  @ApiPropertyOptional()
  failReason?: string;

  @Expose()
  @Type(() => ShipmentStatusHistoryResponseDto)
  @ApiProperty({ type: [ShipmentStatusHistoryResponseDto] })
  statusHistory!: ShipmentStatusHistoryResponseDto[];

  @Expose()
  @ApiPropertyOptional()
  shippedAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  deliveredAt?: Date;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
