// apps/wms/src/purchase-order/purchase-order.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
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
import { PurchaseOrderService } from './purchase-order.service';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderResponseDto,
  QueryPurchaseOrderDto,
} from './dto/purchase-order.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('purchase-order')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly svc: PurchaseOrderService) {}

  @Post()
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Tạo đơn đặt hàng NCC (PO) — [MANAGER, ADMIN]' })
  @ApiCreatedResponse({ type: PurchaseOrderResponseDto })
  async createPurchaseOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<PurchaseOrderResponseDto> {
    const doc = await this.svc.createPurchaseOrder(dto, actorId);
    return plainToInstance(PurchaseOrderResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách PO — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: [PurchaseOrderResponseDto] })
  async listPurchaseOrders(@Query() query: QueryPurchaseOrderDto): Promise<{
    data: PurchaseOrderResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listPurchaseOrders(query);
    return {
      data: plainToInstance(
        PurchaseOrderResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Chi tiết PO — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: PurchaseOrderResponseDto })
  async getPurchaseOrder(
    @Param('id') id: string,
  ): Promise<PurchaseOrderResponseDto> {
    const doc = await this.svc.getPurchaseOrder(id);
    return plainToInstance(PurchaseOrderResponseDto, doc.toObject(), TO_OPTS);
  }
}
