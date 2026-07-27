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
  Put,
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
import { LocationService } from './location.service';
import { CreateZoneDto, UpdateZoneDto, ZoneResponseDto } from './dto/zone.dto';
import { CreateRackDto, UpdateRackDto, RackResponseDto } from './dto/rack.dto';
import {
  CreateShelfDto,
  UpdateShelfDto,
  ShelfResponseDto,
} from './dto/shelf.dto';
import {
  UpdateRackTemplateDto,
  RackTemplateResponseDto,
} from './dto/rack-template.dto';
import {
  CreateAisleDto,
  UpdateAisleDto,
  AisleResponseDto,
} from './dto/aisle.dto';
import {
  CreateGateDto,
  UpdateGateDto,
  GateResponseDto,
} from './dto/gate.dto';

const TO_INSTANCE_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('location')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('location')
export class LocationController {
  constructor(private readonly svc: LocationService) {}

  // ─── RackTemplate (singleton — route cố định) ────────────────────────────

  @Get('rack-template')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Kích thước rack chuẩn dùng chung toàn app — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: RackTemplateResponseDto })
  async getRackTemplate(): Promise<RackTemplateResponseDto> {
    const doc = await this.svc.getRackTemplate();
    return plainToInstance(
      RackTemplateResponseDto,
      doc.toObject(),
      TO_INSTANCE_OPTS,
    );
  }

  @Put('rack-template')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({
    summary:
      'Cập nhật kích thước rack chuẩn — áp dụng cho MỌI rack ngay lập tức — [MANAGER]',
  })
  @ApiOkResponse({ type: RackTemplateResponseDto })
  async updateRackTemplate(
    @Body() dto: UpdateRackTemplateDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<RackTemplateResponseDto> {
    const doc = await this.svc.updateRackTemplate(dto, actorId);
    return plainToInstance(
      RackTemplateResponseDto,
      doc.toObject(),
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
  @ApiOperation({ summary: 'Danh sách zone — [MANAGER]' })
  @ApiOkResponse({ type: [ZoneResponseDto] })
  async listZones(): Promise<ZoneResponseDto[]> {
    const docs = await this.svc.listZones();
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

  // ─── Aisle (static sub-routes phải đặt TRƯỚC `:id`) ──────────────────────

  @Post('aisles')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo lối đi (aisle) — [MANAGER]' })
  @ApiCreatedResponse({ type: AisleResponseDto })
  async createAisle(
    @Body() dto: CreateAisleDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<AisleResponseDto> {
    const doc = await this.svc.createAisle(dto, actorId);
    return plainToInstance(AisleResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Get('aisles')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Danh sách lối đi — [MANAGER]' })
  @ApiOkResponse({ type: [AisleResponseDto] })
  async listAisles(): Promise<AisleResponseDto[]> {
    const docs = await this.svc.listAisles();
    return plainToInstance(
      AisleResponseDto,
      docs.map((d) => d.toObject()),
      TO_INSTANCE_OPTS,
    );
  }

  @Get('aisles/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết lối đi — [MANAGER]' })
  @ApiOkResponse({ type: AisleResponseDto })
  async getAisle(@Param('id') id: string): Promise<AisleResponseDto> {
    const doc = await this.svc.getAisle(id);
    return plainToInstance(AisleResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Patch('aisles/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật lối đi — [MANAGER]' })
  @ApiOkResponse({ type: AisleResponseDto })
  async updateAisle(
    @Param('id') id: string,
    @Body() dto: UpdateAisleDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<AisleResponseDto> {
    const doc = await this.svc.updateAisle(id, dto, actorId);
    return plainToInstance(AisleResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Delete('aisles/:id')
  @Roles(WmsRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá lối đi (soft-delete) — [MANAGER]' })
  @ApiNoContentResponse()
  async deleteAisle(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteAisle(id, actorId);
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

  // ─── Gate (static sub-routes phải đặt TRƯỚC `:id`) ───────────────────────

  @Post('gates')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo cổng (gate) — [MANAGER]' })
  @ApiCreatedResponse({ type: GateResponseDto })
  async createGate(
    @Body() dto: CreateGateDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GateResponseDto> {
    const doc = await this.svc.createGate(dto, actorId);
    return plainToInstance(GateResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Get('gates')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Danh sách cổng — [MANAGER]' })
  @ApiOkResponse({ type: [GateResponseDto] })
  async listGates(): Promise<GateResponseDto[]> {
    const docs = await this.svc.listGates();
    return plainToInstance(
      GateResponseDto,
      docs.map((d) => d.toObject()),
      TO_INSTANCE_OPTS,
    );
  }

  @Get('gates/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết cổng — [MANAGER]' })
  @ApiOkResponse({ type: GateResponseDto })
  async getGate(@Param('id') id: string): Promise<GateResponseDto> {
    const doc = await this.svc.getGate(id);
    return plainToInstance(GateResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Patch('gates/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật cổng — [MANAGER]' })
  @ApiOkResponse({ type: GateResponseDto })
  async updateGate(
    @Param('id') id: string,
    @Body() dto: UpdateGateDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GateResponseDto> {
    const doc = await this.svc.updateGate(id, dto, actorId);
    return plainToInstance(GateResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Delete('gates/:id')
  @Roles(WmsRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá cổng (soft-delete) — [MANAGER]' })
  @ApiNoContentResponse()
  async deleteGate(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteGate(id, actorId);
  }
}
