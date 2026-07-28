import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** Tồn kho thật tại 1 shelf (rack elevation view) — join InventoryStock →
 * WarehouseItem (tên/unit) → Lot (số lô/hạn dùng, optional). */
export class ShelfContentResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  sku!: string;

  @Expose()
  @ApiProperty()
  itemName!: string;

  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @ApiProperty()
  quantity!: number;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  lotNumber!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  expiryDate!: Date | null;
}
