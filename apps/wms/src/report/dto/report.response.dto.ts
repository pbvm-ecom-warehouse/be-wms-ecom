import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { LotStatus } from '../../stock/schemas/lot.schema';
import { MovementType } from '../../stock/schemas/stock-movement.schema';

export type ExpiryFlag = 'ok' | 'expiringSoon' | 'expired';

export class StockReportItemDto {
  @Expose()
  @ApiProperty()
  sku!: string;

  @Expose()
  @ApiProperty()
  itemName!: string;

  @Expose()
  @ApiProperty()
  warehouseId!: string;

  @Expose()
  @ApiProperty()
  warehouseName!: string;

  @Expose()
  @ApiProperty()
  onHand!: number;

  @Expose()
  @ApiProperty()
  reserved!: number;

  @Expose()
  @ApiProperty()
  expired!: number;

  @Expose()
  @ApiProperty()
  available!: number;
}

export class LotReportItemDto {
  @Expose()
  @ApiProperty()
  sku!: string;

  @Expose()
  @ApiProperty()
  itemName!: string;

  @Expose()
  @ApiProperty()
  lotNumber!: string;

  @Expose()
  @ApiProperty()
  expiryDate!: Date;

  @Expose()
  @ApiProperty()
  warehouseId!: string;

  @Expose()
  @ApiProperty()
  warehouseName!: string;

  @Expose()
  @ApiProperty()
  quantity!: number;

  @Expose()
  @ApiProperty({ enum: LotStatus })
  status!: LotStatus;

  @Expose()
  @ApiProperty({ enum: ['ok', 'expiringSoon', 'expired'] })
  expiryFlag!: ExpiryFlag;
}

export class PerformanceReportItemDto {
  @Expose()
  @ApiProperty({ enum: MovementType })
  type!: MovementType;

  @Expose()
  @ApiProperty()
  totalQuantity!: number;

  @Expose()
  @ApiProperty()
  movementCount!: number;
}
