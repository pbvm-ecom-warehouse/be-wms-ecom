import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { ShipmentService } from './shipment.service';
import {
  AssignShipmentDto,
  UpdateShipmentStatusDto,
  QueryShipmentDto,
  ShipmentResponseDto,
} from './dto/shipment.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shipments')
export class ShipmentController {
  constructor(private readonly svc: ShipmentService) {}

  @Get()
  @Roles(WmsRole.SHIPPER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách vận đơn — [SHIPPER, MANAGER, ADMIN]' })
  @ApiOkResponse({ type: [ShipmentResponseDto] })
  async list(@Query() query: QueryShipmentDto): Promise<{
    data: ShipmentResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.list(query);
    return {
      data: plainToInstance(
        ShipmentResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.SHIPPER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Chi tiết vận đơn — [SHIPPER, MANAGER, ADMIN]' })
  @ApiOkResponse({ type: ShipmentResponseDto })
  async getById(@Param('id') id: string): Promise<ShipmentResponseDto> {
    const doc = await this.svc.getById(id);
    return plainToInstance(ShipmentResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id/assign')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Gán hãng vận chuyển + mã tracking — [SHIPPER, ADMIN]',
  })
  @ApiOkResponse({ type: ShipmentResponseDto })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignShipmentDto,
  ): Promise<ShipmentResponseDto> {
    const doc = await this.svc.assignCarrier(
      id,
      dto.carrierId,
      dto.trackingNumber,
    );
    return plainToInstance(ShipmentResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id/status')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật trạng thái giao hàng — [SHIPPER, ADMIN]' })
  @ApiOkResponse({ type: ShipmentResponseDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<ShipmentResponseDto> {
    const doc = await this.svc.updateStatus(id, dto.status, actorId, {
      note: dto.note,
      failReason: dto.failReason,
    });
    return plainToInstance(ShipmentResponseDto, doc.toObject(), TO_OPTS);
  }
}
