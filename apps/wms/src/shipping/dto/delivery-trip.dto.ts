import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Types } from 'mongoose';
import { DeliveryTripStatus } from '../schemas/delivery-trip.schema';

export class CreateDeliveryTripDto {
  @ApiProperty({ description: 'ObjectId user có role SHIPPER' })
  @IsMongoId()
  assignedShipperId!: string;

  @ApiProperty({
    type: [String],
    description: 'Danh sách Shipment READY theo thứ tự giao ban đầu',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  shipmentIds!: string[];
}

export class UpdateDeliveryTripRouteDto {
  @ApiProperty({
    type: [String],
    description: 'Đủ đúng tập Shipment của chuyến, theo thứ tự mới',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  shipmentIds!: string[];
}

export class ScanDeliveryTripPackageDto {
  @ApiProperty({ example: 'PKG-20260730-0001' })
  @IsString()
  barcode!: string;
}

export class QueryDeliveryTripDto {
  @ApiPropertyOptional({ enum: DeliveryTripStatus })
  @IsOptional()
  @IsEnum(DeliveryTripStatus)
  status?: DeliveryTripStatus;

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

class DeliveryTripStopResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { shipmentId?: Types.ObjectId } }) =>
    obj.shipmentId?.toString(),
  )
  @ApiProperty()
  shipmentId!: string;

  @Expose()
  @ApiProperty()
  routeOrder!: number;
}

class DeliveryTripStatusHistoryResponseDto {
  @Expose()
  @ApiProperty({ enum: DeliveryTripStatus })
  status!: DeliveryTripStatus;

  @Expose()
  @ApiProperty()
  at!: Date;

  @Expose()
  @Transform(({ obj }: { obj: { by?: Types.ObjectId } }) => obj.by?.toString())
  @ApiProperty()
  by!: string;

  @Expose()
  @ApiPropertyOptional()
  note?: string;
}

export class DeliveryTripResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ example: 'TRIP-20260730-0001' })
  tripNumber!: string;

  @Expose()
  @Transform(({ obj }: { obj: { assignedShipperId?: Types.ObjectId } }) =>
    obj.assignedShipperId?.toString(),
  )
  @ApiProperty()
  assignedShipperId!: string;

  @Expose()
  @Type(() => DeliveryTripStopResponseDto)
  @ApiProperty({ type: [DeliveryTripStopResponseDto] })
  stops!: DeliveryTripStopResponseDto[];

  @Expose()
  @ApiProperty({ enum: DeliveryTripStatus })
  status!: DeliveryTripStatus;

  @Expose()
  @Type(() => DeliveryTripStatusHistoryResponseDto)
  @ApiProperty({ type: [DeliveryTripStatusHistoryResponseDto] })
  statusHistory!: DeliveryTripStatusHistoryResponseDto[];

  @Expose()
  @ApiPropertyOptional()
  startedAt?: Date;

  @Expose()
  @ApiPropertyOptional()
  completedAt?: Date;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
