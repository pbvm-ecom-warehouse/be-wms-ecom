import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import {
  CreateDeliveryTripDto,
  DeliveryTripResponseDto,
  QueryDeliveryTripDto,
  ScanDeliveryTripPackageDto,
  UpdateDeliveryTripRouteDto,
} from './dto/delivery-trip.dto';
import { DeliveryTripService } from './delivery-trip.service';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('delivery-trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('delivery-trips')
export class DeliveryTripController {
  constructor(private readonly service: DeliveryTripService) {}

  @Post()
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Tạo chuyến DRAFT từ các Shipment READY cùng một Shipper — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async create(
    @Body() dto: CreateDeliveryTripDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.create(dto, actorId);
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.SHIPPER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách chuyến; Shipper chỉ thấy chuyến của mình — [SHIPPER, MANAGER, ADMIN]',
  })
  async list(
    @Query() query: QueryDeliveryTripDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<{
    data: DeliveryTripResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.service.list(query, actorId, actorRole);
    return {
      data: plainToInstance(
        DeliveryTripResponseDto,
        data.map((trip) => trip.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.SHIPPER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Chi tiết chuyến; Shipper chỉ xem chuyến của mình — [SHIPPER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async getById(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.getByIdForActor(id, actorId, actorRole);
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Patch(':id/route')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Sắp thứ tự dừng thủ công khi còn DRAFT — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async updateRoute(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryTripRouteDto,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.updateRoute(id, dto.shipmentIds);
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/route/optimize')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Tối ưu nearest-neighbour khi đủ tọa độ; thiếu tọa độ thì giữ thứ tự — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async optimizeRoute(
    @Param('id') id: string,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.optimizeRoute(id);
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/ready')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Chốt chuyến DRAFT để Shipper chất kiện — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async markReady(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.markReady(id, actorId);
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/packages/scan')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Quét package để chất đúng chuyến; lặp cùng chuyến là idempotent — [SHIPPER owner, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async scanPackage(
    @Param('id') id: string,
    @Body() dto: ScanDeliveryTripPackageDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.scanPackage(
      id,
      dto.barcode,
      actorId,
      actorRole,
    );
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/start')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Bắt đầu giao khi mọi package đã scan; phát shipment.shipped — [SHIPPER owner, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async start(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.start(id, actorId, actorRole);
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }
}
