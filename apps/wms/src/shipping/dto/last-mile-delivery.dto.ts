import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Types } from 'mongoose';
import {
  DeliveryIncidentResolutionAction,
  DeliveryIncidentStatus,
  DeliveryIncidentType,
} from '../schemas/delivery-incident.schema';
import { CodCollectionMethod } from '../schemas/shipment.schema';

export class DeliveryOtpResponseDto {
  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  resendAvailableAt!: Date;
}

export class DeliverShipmentFormDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;

  @ApiPropertyOptional({
    enum: CodCollectionMethod,
    description: 'Bắt buộc cho đơn COD còn tiền phải thu',
  })
  @IsOptional()
  @IsEnum(CodCollectionMethod)
  codCollectionMethod?: CodCollectionMethod;
}

export class FailedDeliveryAttemptDto {
  @ApiProperty({ example: 'Khách không nghe máy' })
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class ReturnPackageScanDto {
  @ApiProperty({ example: 'PKG-20260730-0001' })
  @IsString()
  @MinLength(1)
  barcode!: string;
}

export class SettleTripCashDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;
}

export class ReportDeliveryIncidentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  shipmentId?: string;

  @ApiProperty({ enum: DeliveryIncidentType })
  @IsEnum(DeliveryIncidentType)
  type!: DeliveryIncidentType;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  description!: string;
}

export class ResolveDeliveryIncidentDto {
  @ApiProperty({ enum: DeliveryIncidentResolutionAction })
  @IsEnum(DeliveryIncidentResolutionAction)
  action!: DeliveryIncidentResolutionAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc khi action=RESCUE' })
  @ValidateIf(
    (value: ResolveDeliveryIncidentDto) =>
      value.action === DeliveryIncidentResolutionAction.RESCUE,
  )
  @IsMongoId()
  rescueShipperId?: string;
}

export class DeliveryIncidentResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  incidentNumber!: string;

  @Expose()
  @Transform(({ obj }: { obj: { tripId?: Types.ObjectId } }) =>
    obj.tripId?.toString(),
  )
  @ApiProperty()
  tripId!: string;

  @Expose()
  @Transform(({ obj }: { obj: { shipmentId?: Types.ObjectId } }) =>
    obj.shipmentId?.toString(),
  )
  @ApiPropertyOptional()
  shipmentId?: string;

  @Expose()
  @ApiProperty({ enum: DeliveryIncidentType })
  type!: DeliveryIncidentType;

  @Expose()
  @ApiProperty()
  description!: string;

  @Expose()
  @ApiProperty({ enum: DeliveryIncidentStatus })
  status!: DeliveryIncidentStatus;

  @Expose()
  @Transform(({ obj }: { obj: { reportedBy?: Types.ObjectId } }) =>
    obj.reportedBy?.toString(),
  )
  @ApiProperty()
  reportedBy!: string;

  @Expose()
  @ApiProperty()
  reportedAt!: Date;

  @Expose()
  @ApiPropertyOptional({ enum: DeliveryIncidentResolutionAction })
  resolutionAction?: DeliveryIncidentResolutionAction;

  @Expose()
  @ApiPropertyOptional()
  resolutionNote?: string;

  @Expose()
  @Transform(({ obj }: { obj: { resolvedBy?: Types.ObjectId } }) =>
    obj.resolvedBy?.toString(),
  )
  @ApiPropertyOptional()
  resolvedBy?: string;

  @Expose()
  @ApiPropertyOptional()
  resolvedAt?: Date;
}
