// apps/wms/src/stock/stock.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  WmsRole,
} from '@app/auth';
import { plainToInstance } from 'class-transformer';
import { StockService } from './stock.service';
import { CreateWarehouseItemDto } from './dto/create-warehouse-item.dto';
import { WarehouseItemResponseDto } from './dto/warehouse-item.response.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock/items')
export class StockController {
  constructor(private readonly svc: StockService) {}

  @Post()
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo mặt hàng kho mới — [ADMIN, MANAGER]' })
  @ApiCreatedResponse({ type: WarehouseItemResponseDto })
  async create(
    @Body() dto: CreateWarehouseItemDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<WarehouseItemResponseDto> {
    const doc = await this.svc.createWarehouseItem(dto, actorId);
    return plainToInstance(WarehouseItemResponseDto, doc.toObject(), TO_OPTS);
  }
}
