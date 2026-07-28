import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export enum LayoutOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export enum LayoutEntity {
  CANVAS = 'CANVAS',
  RACK_TEMPLATE = 'RACK_TEMPLATE',
  ZONE = 'ZONE',
  RACK = 'RACK',
  SHELF = 'SHELF',
  AISLE = 'AISLE',
  GATE = 'GATE',
}

export class WarehouseLayoutOperationDto {
  @ApiProperty({ enum: LayoutOperation, example: LayoutOperation.CREATE })
  @IsEnum(LayoutOperation)
  op!: LayoutOperation;

  @ApiProperty({ enum: LayoutEntity, example: LayoutEntity.ZONE })
  @IsEnum(LayoutEntity)
  entity!: LayoutEntity;

  @ApiPropertyOptional({
    description: 'Bắt buộc cho CREATE; UUID tạm để operation sau tham chiếu.',
    example: 'tmp:550e8400-e29b-41d4-a716-446655440000',
    pattern:
      '^tmp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  })
  @ValidateIf(
    (operation: WarehouseLayoutOperationDto) =>
      operation.op === LayoutOperation.CREATE,
  )
  @IsString()
  @Matches(
    /^tmp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  clientId?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Payload đầy đủ cho CREATE. zoneId/rackId có thể là ObjectId hoặc clientId đã xuất hiện trước đó.',
    example: {
      code: 'ZONE-A',
      name: 'Khu A',
      xM: 1,
      yM: 1,
      widthM: 18,
      heightM: 10,
      rotation: 0,
    },
  })
  @ValidateIf(
    (operation: WarehouseLayoutOperationDto) =>
      operation.op === LayoutOperation.CREATE,
  )
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'ObjectId bắt buộc cho DELETE và UPDATE entity thường; bỏ qua với CANVAS/RACK_TEMPLATE.',
    example: '507f1f77bcf86cd799439011',
  })
  @ValidateIf(
    (operation: WarehouseLayoutOperationDto) =>
      operation.op === LayoutOperation.DELETE ||
      (operation.op === LayoutOperation.UPDATE &&
        operation.entity !== LayoutEntity.CANVAS &&
        operation.entity !== LayoutEntity.RACK_TEMPLATE),
  )
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Các field cần đổi cho UPDATE.',
    example: { xM: 4, yM: 2, rotation: 90 },
  })
  @ValidateIf(
    (operation: WarehouseLayoutOperationDto) =>
      operation.op === LayoutOperation.UPDATE,
  )
  @IsObject()
  patch?: Record<string, unknown>;
}

export class SaveWarehouseLayoutDto {
  @ApiProperty({
    minimum: 1,
    example: 7,
    description: 'Revision FE đã đọc gần nhất từ GET /location/layout.',
  })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @ApiProperty({
    type: [WarehouseLayoutOperationDto],
    minItems: 1,
    maxItems: 500,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WarehouseLayoutOperationDto)
  operations!: WarehouseLayoutOperationDto[];
}

export class CanvasPatchDto {
  @ApiPropertyOptional({ minimum: 0.1, example: 40 })
  @IsOptional()
  @Type(() => Number)
  @Min(0.1)
  widthM?: number;

  @ApiPropertyOptional({ minimum: 0.1, example: 24 })
  @IsOptional()
  @Type(() => Number)
  @Min(0.1)
  heightM?: number;

  @ApiPropertyOptional({ minimum: 0.1, example: 0.5 })
  @IsOptional()
  @Type(() => Number)
  @Min(0.1)
  gridM?: number;
}
