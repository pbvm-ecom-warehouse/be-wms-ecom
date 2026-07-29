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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
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
import { CreateGateDto, UpdateGateDto, GateResponseDto } from './dto/gate.dto';
import {
  LayoutConflictErrorDto,
  LayoutOperationErrorDto,
  LayoutResponseDto,
  LayoutResponseEnvelopeDto,
  LayoutRevisionConflictErrorDto,
  LayoutValidationErrorDto,
  ResetWarehouseLayoutDto,
  SaveWarehouseLayoutResponseDto,
  SaveWarehouseLayoutResponseEnvelopeDto,
} from './dto/layout.dto';
import { SaveWarehouseLayoutDto } from './dto/layout-change.dto';
import { WarehouseLayoutEditorService } from './warehouse-layout-editor.service';
import { ShelfContentResponseDto } from './dto/shelf-content.dto';
import { WarehouseNavigationService } from './navigation.service';

const TO_INSTANCE_OPTS = { excludeExtraneousValues: true } as const;

function isMongooseDocument(
  value: unknown,
): value is { toObject(): Record<string, unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toObject' in value &&
    typeof (value as { toObject?: unknown }).toObject === 'function'
  );
}

@ApiTags('location')
@ApiExtraModels(LayoutRevisionConflictErrorDto, LayoutConflictErrorDto)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('location')
export class LocationController {
  constructor(
    private readonly svc: LocationService,
    private readonly editorService: WarehouseLayoutEditorService,
    private readonly navigationService: WarehouseNavigationService,
  ) {}

  // ─── Layout tổng hợp (đặt đầu tiên, route cố định không xung đột) ────────

  @Get('layout')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN, WmsRole.RECEIVER, WmsRole.SHIPPER)
  @ApiOperation({
    summary:
      'Snapshot sơ đồ kho 2D (canvas+zone+rack+shelf+aisle+gate) — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: LayoutResponseEnvelopeDto })
  async getLayout(): Promise<LayoutResponseDto> {
    const layout = await this.svc.getLayout();
    return this.toLayoutResponse(layout);
  }

  @Get('navigation')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN, WmsRole.RECEIVER, WmsRole.SHIPPER)
  @ApiOperation({ summary: 'Đường đi từ GATE-01 tới rack đích' })
  getNavigation(@Query('targetRackId') targetRackId: string) {
    return this.navigationService.getPath(targetRackId);
  }
  @Patch('layout')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({
    summary: 'Lưu change-set sơ đồ kho bằng Mongo transaction — [MANAGER]',
  })
  @ApiOkResponse({ type: SaveWarehouseLayoutResponseEnvelopeDto })
  @ApiBadRequestResponse({
    description: 'DTO hoặc operation không hợp lệ',
    type: LayoutOperationErrorDto,
  })
  @ApiConflictResponse({
    description: 'Revision conflict, code bị trùng hoặc vi phạm delete guard',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(LayoutRevisionConflictErrorDto) },
        { $ref: getSchemaPath(LayoutConflictErrorDto) },
      ],
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'LAYOUT_VALIDATION_FAILED — hình học layout không hợp lệ',
    type: LayoutValidationErrorDto,
  })
  async saveLayout(
    @Body() dto: SaveWarehouseLayoutDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<SaveWarehouseLayoutResponseDto> {
    const result = await this.editorService.saveLayout(dto, actorId);
    return plainToInstance(
      SaveWarehouseLayoutResponseDto,
      {
        revision: result.revision,
        idMap: result.idMap,
        layout: this.toLayoutSource(result.layout),
      },
      TO_INSTANCE_OPTS,
    );
  }

  @Post('layout/reset')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({
    summary:
      'Xoá sạch zone/rack/shelf/aisle/gate hiện có để dựng lại sơ đồ kho — [MANAGER]',
  })
  @ApiOkResponse({ type: LayoutResponseEnvelopeDto })
  @ApiConflictResponse({
    description: 'Không thể reset khi vẫn còn tồn kho trên các shelf hiện tại',
    type: LayoutConflictErrorDto,
  })
  async resetLayout(
    @Body() dto: ResetWarehouseLayoutDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<LayoutResponseDto> {
    const layout = await this.svc.resetLayout(dto.expectedRevision, actorId);
    return this.toLayoutResponse(layout);
  }

  private toLayoutResponse(layout: {
    id: 'single-warehouse-layout';
    revision: number;
    updatedAt: Date;
    canvas: { widthM: number; heightM: number; gridM: number };
    zones: unknown[];
    racks: unknown[];
    shelves: unknown[];
    aisles: unknown[];
    gates: unknown[];
    rackTemplate: unknown;
  }): LayoutResponseDto {
    return plainToInstance(
      LayoutResponseDto,
      this.toLayoutSource(layout),
      TO_INSTANCE_OPTS,
    );
  }

  private toLayoutSource(layout: {
    id: 'single-warehouse-layout';
    revision: number;
    updatedAt: Date;
    canvas: { widthM: number; heightM: number; gridM: number };
    zones: unknown[];
    racks: unknown[];
    shelves: unknown[];
    aisles: unknown[];
    gates: unknown[];
    rackTemplate: unknown;
  }) {
    const toPlain = (value: unknown): unknown =>
      isMongooseDocument(value) ? value.toObject() : value;
    return {
      id: layout.id,
      revision: layout.revision,
      updatedAt: layout.updatedAt,
      canvas: layout.canvas,
      zones: layout.zones.map(toPlain),
      racks: layout.racks.map(toPlain),
      shelves: layout.shelves.map(toPlain),
      aisles: layout.aisles.map(toPlain),
      gates: layout.gates.map(toPlain),
      rackTemplate: toPlain(layout.rackTemplate),
    };
  }

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

  @Get('racks/:id/cells')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN, WmsRole.RECEIVER, WmsRole.SHIPPER)
  @ApiOperation({
    summary:
      'Danh sách khoang và tồn thật của một rack — [MANAGER, ADMIN, RECEIVER, SHIPPER]',
  })
  async getRackCells(@Param('id') id: string) {
    return this.svc.getRackCells(id);
  }
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

  @Get('cells/:id/contents')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN, WmsRole.RECEIVER, WmsRole.SHIPPER)
  @ApiOperation({
    summary:
      'Tồn kho thật tại 1 khoang (cell) — [MANAGER, ADMIN, RECEIVER, SHIPPER]',
  })
  @ApiOkResponse({ type: [ShelfContentResponseDto] })
  async getCellContents(
    @Param('id') id: string,
  ): Promise<ShelfContentResponseDto[]> {
    const rows = await this.svc.getCellContents(id);
    return plainToInstance(ShelfContentResponseDto, rows, TO_INSTANCE_OPTS);
  }
  @Get('shelves/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết shelf — [MANAGER]' })
  @ApiOkResponse({ type: ShelfResponseDto })
  async getShelf(@Param('id') id: string): Promise<ShelfResponseDto> {
    const doc = await this.svc.getShelf(id);
    return plainToInstance(ShelfResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Get('shelves/:id/contents')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN, WmsRole.RECEIVER, WmsRole.SHIPPER)
  @ApiOperation({
    summary:
      'Tồn kho thật tại 1 shelf (cho rack elevation view) — [MANAGER, ADMIN, RECEIVER, SHIPPER]',
  })
  @ApiOkResponse({ type: [ShelfContentResponseDto] })
  async getShelfContents(
    @Param('id') id: string,
  ): Promise<ShelfContentResponseDto[]> {
    const rows = await this.svc.getShelfContents(id);
    return plainToInstance(ShelfContentResponseDto, rows, TO_INSTANCE_OPTS);
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
