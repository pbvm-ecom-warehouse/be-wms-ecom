// apps/wms/src/warehouse/warehouse.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
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
import { WarehouseService } from './warehouse.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseResponseDto,
} from './dto/warehouse.dto';
import { CreateZoneDto, UpdateZoneDto, ZoneResponseDto } from './dto/zone.dto';
import { CreateRackDto, UpdateRackDto, RackResponseDto } from './dto/rack.dto';
import {
  CreateShelfDto,
  UpdateShelfDto,
  ShelfResponseDto,
} from './dto/shelf.dto';

const TO_INSTANCE_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly svc: WarehouseService) {}

  // ─── Warehouse ────────────────────────────────────────────────────────────

  @Post()
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo kho — [MANAGER]' })
  @ApiCreatedResponse({ type: WarehouseResponseDto })
  async createWarehouse(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<WarehouseResponseDto> {
    const doc = await this.svc.createWarehouse(dto, actorId);
    return plainToInstance(
      WarehouseResponseDto,
      doc.toObject(),
      TO_INSTANCE_OPTS,
    );
  }

  @Get()
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Danh sách kho — [MANAGER]' })
  @ApiOkResponse({ type: [WarehouseResponseDto] })
  async listWarehouses(): Promise<WarehouseResponseDto[]> {
    const docs = await this.svc.listWarehouses();
    return plainToInstance(
      WarehouseResponseDto,
      docs.map((d) => d.toObject()),
      TO_INSTANCE_OPTS,
    );
  }

  // ─── Zone (static sub-routes phải đặt TRƯỚC `:id` để tránh NestJS shadow) ──

  @Post('zones')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo khu vực (zone) — [MANAGER]' })
  @ApiCreatedResponse({ type: ZoneResponseDto })
  async createZone(
    @Body() dto: CreateZoneDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<ZoneResponseDto> {
    const doc = await this.svc.createZone(dto, actorId);
    return plainToInstance(ZoneResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Get('zones')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Danh sách zone theo kho — [MANAGER]' })
  @ApiQuery({ name: 'warehouseId', required: true })
  @ApiOkResponse({ type: [ZoneResponseDto] })
  async listZones(
    @Query('warehouseId') warehouseId: string,
  ): Promise<ZoneResponseDto[]> {
    const docs = await this.svc.listZones(warehouseId);
    return plainToInstance(
      ZoneResponseDto,
      docs.map((d) => d.toObject()),
      TO_INSTANCE_OPTS,
    );
  }

  // ─── Rack (static sub-routes phải đặt TRƯỚC `:id`) ───────────────────────

  @Post('racks')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo kệ (rack) — [MANAGER]' })
  @ApiCreatedResponse({ type: RackResponseDto })
  async createRack(
    @Body() dto: CreateRackDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<RackResponseDto> {
    const doc = await this.svc.createRack(dto, actorId);
    return plainToInstance(RackResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Get('racks')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Danh sách rack theo zone — [MANAGER]' })
  @ApiQuery({ name: 'zoneId', required: true })
  @ApiOkResponse({ type: [RackResponseDto] })
  async listRacks(@Query('zoneId') zoneId: string): Promise<RackResponseDto[]> {
    const docs = await this.svc.listRacks(zoneId);
    return plainToInstance(
      RackResponseDto,
      docs.map((d) => d.toObject()),
      TO_INSTANCE_OPTS,
    );
  }

  // ─── Shelf (static sub-routes phải đặt TRƯỚC `:id`) ──────────────────────

  @Post('shelves')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo tầng kệ (shelf) — [MANAGER]' })
  @ApiCreatedResponse({ type: ShelfResponseDto })
  async createShelf(
    @Body() dto: CreateShelfDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<ShelfResponseDto> {
    const doc = await this.svc.createShelf(dto, actorId);
    return plainToInstance(ShelfResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Get('shelves')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Danh sách shelf theo rack — [MANAGER]' })
  @ApiQuery({ name: 'rackId', required: true })
  @ApiOkResponse({ type: [ShelfResponseDto] })
  async listShelves(
    @Query('rackId') rackId: string,
  ): Promise<ShelfResponseDto[]> {
    const docs = await this.svc.listShelves(rackId);
    return plainToInstance(
      ShelfResponseDto,
      docs.map((d) => d.toObject()),
      TO_INSTANCE_OPTS,
    );
  }

  // ─── Warehouse param routes (sau tất cả static sub-routes) ───────────────

  @Get(':id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết kho — [MANAGER]' })
  @ApiOkResponse({ type: WarehouseResponseDto })
  async getWarehouse(@Param('id') id: string): Promise<WarehouseResponseDto> {
    const doc = await this.svc.getWarehouse(id);
    return plainToInstance(
      WarehouseResponseDto,
      doc.toObject(),
      TO_INSTANCE_OPTS,
    );
  }

  @Patch(':id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật kho — [MANAGER]' })
  @ApiOkResponse({ type: WarehouseResponseDto })
  async updateWarehouse(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<WarehouseResponseDto> {
    const doc = await this.svc.updateWarehouse(id, dto, actorId);
    return plainToInstance(
      WarehouseResponseDto,
      doc.toObject(),
      TO_INSTANCE_OPTS,
    );
  }

  @Delete(':id')
  @Roles(WmsRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá kho (soft-delete) — [MANAGER]' })
  @ApiNoContentResponse()
  async deleteWarehouse(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteWarehouse(id, actorId);
  }

  // ─── Zone param routes ────────────────────────────────────────────────────

  @Get('zones/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết zone — [MANAGER]' })
  @ApiOkResponse({ type: ZoneResponseDto })
  async getZone(@Param('id') id: string): Promise<ZoneResponseDto> {
    const doc = await this.svc.getZone(id);
    return plainToInstance(ZoneResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Patch('zones/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật zone — [MANAGER]' })
  @ApiOkResponse({ type: ZoneResponseDto })
  async updateZone(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<ZoneResponseDto> {
    const doc = await this.svc.updateZone(id, dto, actorId);
    return plainToInstance(ZoneResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Delete('zones/:id')
  @Roles(WmsRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá zone (soft-delete) — [MANAGER]' })
  @ApiNoContentResponse()
  async deleteZone(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteZone(id, actorId);
  }

  // ─── Rack param routes ────────────────────────────────────────────────────

  @Get('racks/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết rack — [MANAGER]' })
  @ApiOkResponse({ type: RackResponseDto })
  async getRack(@Param('id') id: string): Promise<RackResponseDto> {
    const doc = await this.svc.getRack(id);
    return plainToInstance(RackResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Patch('racks/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật rack — [MANAGER]' })
  @ApiOkResponse({ type: RackResponseDto })
  async updateRack(
    @Param('id') id: string,
    @Body() dto: UpdateRackDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<RackResponseDto> {
    const doc = await this.svc.updateRack(id, dto, actorId);
    return plainToInstance(RackResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Delete('racks/:id')
  @Roles(WmsRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá rack (soft-delete) — [MANAGER]' })
  @ApiNoContentResponse()
  async deleteRack(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteRack(id, actorId);
  }

  // ─── Shelf param routes ───────────────────────────────────────────────────

  @Get('shelves/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết shelf — [MANAGER]' })
  @ApiOkResponse({ type: ShelfResponseDto })
  async getShelf(@Param('id') id: string): Promise<ShelfResponseDto> {
    const doc = await this.svc.getShelf(id);
    return plainToInstance(ShelfResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Patch('shelves/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật shelf — [MANAGER]' })
  @ApiOkResponse({ type: ShelfResponseDto })
  async updateShelf(
    @Param('id') id: string,
    @Body() dto: UpdateShelfDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<ShelfResponseDto> {
    const doc = await this.svc.updateShelf(id, dto, actorId);
    return plainToInstance(ShelfResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Delete('shelves/:id')
  @Roles(WmsRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá shelf (soft-delete) — [MANAGER]' })
  @ApiNoContentResponse()
  async deleteShelf(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteShelf(id, actorId);
  }
}
