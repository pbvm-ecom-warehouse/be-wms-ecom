import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ZoneResponseDto } from './zone.dto';
import { RackResponseDto } from './rack.dto';
import { AisleResponseDto } from './aisle.dto';
import { GateResponseDto } from './gate.dto';
import { RackTemplateResponseDto } from './rack-template.dto';

/** Response tổng hợp toàn bộ layout kho — zone+rack+aisle+gate+rackTemplate — cho FE vẽ sơ đồ 2D. */
export class LayoutResponseDto {
  @Expose()
  @Type(() => ZoneResponseDto)
  @ApiProperty({ type: [ZoneResponseDto] })
  zones!: ZoneResponseDto[];

  @Expose()
  @Type(() => RackResponseDto)
  @ApiProperty({ type: [RackResponseDto] })
  racks!: RackResponseDto[];

  @Expose()
  @Type(() => AisleResponseDto)
  @ApiProperty({ type: [AisleResponseDto] })
  aisles!: AisleResponseDto[];

  @Expose()
  @Type(() => GateResponseDto)
  @ApiProperty({ type: [GateResponseDto] })
  gates!: GateResponseDto[];

  @Expose()
  @Type(() => RackTemplateResponseDto)
  @ApiProperty({ type: RackTemplateResponseDto })
  rackTemplate!: RackTemplateResponseDto;
}
