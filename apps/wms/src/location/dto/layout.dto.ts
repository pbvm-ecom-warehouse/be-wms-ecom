import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ZoneResponseDto } from './zone.dto';
import { RackResponseDto } from './rack.dto';
import { ShelfResponseDto } from './shelf.dto';
import { AisleResponseDto } from './aisle.dto';
import { GateResponseDto } from './gate.dto';
import { RackTemplateResponseDto } from './rack-template.dto';

export class ResetWarehouseLayoutDto {
  @ApiProperty({
    example: 8,
    description: 'Revision canonical mà người dùng vừa xác nhận reset',
  })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class WarehouseLayoutCanvasResponseDto {
  @Expose()
  @ApiProperty({ example: 40 })
  widthM!: number;

  @Expose()
  @ApiProperty({ example: 24 })
  heightM!: number;

  @Expose()
  @ApiProperty({ example: 0.5 })
  gridM!: number;
}

/** Snapshot đầy đủ của sơ đồ kho singleton cho editor 2D. */
export class LayoutResponseDto {
  @Expose()
  @ApiProperty({ example: 'single-warehouse-layout' })
  id!: 'single-warehouse-layout';

  @Expose()
  @ApiProperty({ example: 1 })
  revision!: number;

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @Expose()
  @Type(() => WarehouseLayoutCanvasResponseDto)
  @ApiProperty({ type: WarehouseLayoutCanvasResponseDto })
  canvas!: WarehouseLayoutCanvasResponseDto;

  @Expose()
  @Type(() => ZoneResponseDto)
  @ApiProperty({ type: [ZoneResponseDto] })
  zones!: ZoneResponseDto[];

  @Expose()
  @Type(() => RackResponseDto)
  @ApiProperty({ type: [RackResponseDto] })
  racks!: RackResponseDto[];

  @Expose()
  @Type(() => ShelfResponseDto)
  @ApiProperty({ type: [ShelfResponseDto] })
  shelves!: ShelfResponseDto[];

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

export class SaveWarehouseLayoutResponseDto {
  @Expose()
  @ApiProperty({ example: 2 })
  revision!: number;

  @Expose()
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: {
      'tmp:550e8400-e29b-41d4-a716-446655440000': '507f1f77bcf86cd799439011',
    },
  })
  idMap!: Record<string, string>;

  @Expose()
  @Type(() => LayoutResponseDto)
  @ApiProperty({ type: LayoutResponseDto })
  layout!: LayoutResponseDto;
}
export class LayoutErrorMetaDto {
  @ApiPropertyOptional({ example: 'req-123' })
  requestId?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: '/api/wms/location/layout' })
  path!: string;
}

export class LayoutSuccessMetaDto {
  @ApiPropertyOptional({ example: 'req-123' })
  requestId?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp!: string;
}

export class LayoutResponseEnvelopeDto {
  @ApiProperty({ type: LayoutResponseDto })
  data!: LayoutResponseDto;

  @ApiProperty({ type: LayoutSuccessMetaDto })
  meta!: LayoutSuccessMetaDto;
}

export class SaveWarehouseLayoutResponseEnvelopeDto {
  @ApiProperty({ type: SaveWarehouseLayoutResponseDto })
  data!: SaveWarehouseLayoutResponseDto;

  @ApiProperty({ type: LayoutSuccessMetaDto })
  meta!: LayoutSuccessMetaDto;
}
export class LayoutRevisionConflictDetailsDto {
  @ApiProperty({ example: 7 })
  expectedRevision!: number;

  @ApiProperty({ example: 8 })
  currentRevision!: number;
}

export class LayoutRevisionConflictErrorBodyDto {
  @ApiProperty({ enum: ['LAYOUT_REVISION_CONFLICT'] })
  code!: 'LAYOUT_REVISION_CONFLICT';

  @ApiProperty({ example: 'Sơ đồ kho đã được cập nhật bởi phiên khác' })
  message!: string;

  @ApiProperty({ type: LayoutRevisionConflictDetailsDto })
  details!: LayoutRevisionConflictDetailsDto;
}

export class LayoutRevisionConflictErrorDto {
  @ApiProperty({ type: LayoutRevisionConflictErrorBodyDto })
  error!: LayoutRevisionConflictErrorBodyDto;

  @ApiProperty({ type: LayoutErrorMetaDto })
  meta!: LayoutErrorMetaDto;
}

export class LayoutConflictErrorBodyDto {
  @ApiProperty({
    enum: [
      'ZONE_CODE_EXISTS',
      'RACK_CODE_EXISTS',
      'SHELF_CODE_EXISTS',
      'AISLE_CODE_EXISTS',
      'GATE_CODE_EXISTS',
      'ZONE_HAS_RACKS',
      'RACK_HAS_SHELVES',
      'STAGING_SHELF_CANNOT_DELETE',
      'SHELF_HAS_STOCK',
      'LAYOUT_RESET_REQUIRES_EMPTY_STOCK',
      'RACK_TEMPLATE_STOCK_CONFLICT',
    ],
    example: 'RACK_HAS_SHELVES',
  })
  code!: string;

  @ApiProperty({ example: 'Không thể xoá kệ đang còn tầng kệ' })
  message!: string;
}

export class LayoutConflictErrorDto {
  @ApiProperty({ type: LayoutConflictErrorBodyDto })
  error!: LayoutConflictErrorBodyDto;

  @ApiProperty({ type: LayoutErrorMetaDto })
  meta!: LayoutErrorMetaDto;
}

export class LayoutValidationIssueDto {
  @ApiProperty({
    enum: ['CANVAS', 'RACK_TEMPLATE', 'ZONE', 'RACK', 'SHELF', 'AISLE', 'GATE'],
    example: 'RACK',
  })
  entity!: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  id?: string;

  @ApiPropertyOptional({
    example: 'tmp:550e8400-e29b-41d4-a716-446655440000',
  })
  clientId?: string;

  @ApiPropertyOptional({ example: 'widthM' })
  field?: string;

  @ApiProperty({ example: 'RACK_OUTSIDE_ZONE' })
  code!: string;
}

export class LayoutValidationDetailsDto {
  @ApiProperty({ type: [LayoutValidationIssueDto] })
  issues!: LayoutValidationIssueDto[];
}

export class LayoutValidationErrorBodyDto {
  @ApiProperty({ enum: ['LAYOUT_VALIDATION_FAILED'] })
  code!: 'LAYOUT_VALIDATION_FAILED';

  @ApiProperty({ example: 'Sơ đồ kho không hợp lệ' })
  message!: string;

  @ApiProperty({ type: LayoutValidationDetailsDto })
  details!: LayoutValidationDetailsDto;
}

export class LayoutValidationErrorDto {
  @ApiProperty({ type: LayoutValidationErrorBodyDto })
  error!: LayoutValidationErrorBodyDto;

  @ApiProperty({ type: LayoutErrorMetaDto })
  meta!: LayoutErrorMetaDto;
}

export class LayoutOperationErrorBodyDto {
  @ApiProperty({
    enum: [
      'VALIDATION_FAILED',
      'LAYOUT_DUPLICATE_CLIENT_ID',
      'LAYOUT_INVALID_REFERENCE',
      'LAYOUT_OPERATION_NOT_ALLOWED',
    ],
    example: 'LAYOUT_INVALID_REFERENCE',
  })
  code!: string;

  @ApiProperty({ example: 'Tham chiếu ID tạm không hợp lệ hoặc chưa được tạo' })
  message!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;
}

export class LayoutOperationErrorDto {
  @ApiProperty({ type: LayoutOperationErrorBodyDto })
  error!: LayoutOperationErrorBodyDto;

  @ApiProperty({ type: LayoutErrorMetaDto })
  meta!: LayoutErrorMetaDto;
}
