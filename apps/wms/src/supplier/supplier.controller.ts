// apps/wms/src/supplier/supplier.controller.ts
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
import { SupplierService } from './supplier.service';
import {
  ChangeSupplierStatusDto,
  CreateSupplierDto,
  QuerySupplierDto,
  SupplierResponseDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import {
  CreateSupplierItemDto,
  QuerySupplierItemDto,
  SupplierItemResponseDto,
  UpdateSupplierItemDto,
} from './dto/supplier-item.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('supplier')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('supplier')
export class SupplierController {
  constructor(private readonly svc: SupplierService) {}

  // ─── Static sub-routes trước param routes (tránh NestJS route shadowing) ──

  @Post('items')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Upsert danh mục giá SKU — tạo mới nếu chưa có, cập nhật nếu đã có — [MANAGER, ADMIN]',
  })
  @ApiCreatedResponse({ type: SupplierItemResponseDto })
  async upsertSupplierItem(
    @Body() dto: CreateSupplierItemDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<SupplierItemResponseDto> {
    const doc = await this.svc.upsertSupplierItem(dto, actorId);
    return plainToInstance(SupplierItemResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get('items')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách danh mục giá — lọc theo supplierId/itemId (optional) — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [SupplierItemResponseDto] })
  async listSupplierItems(@Query() query: QuerySupplierItemDto): Promise<{
    data: SupplierItemResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listSupplierItems(query);
    return {
      data: plainToInstance(SupplierItemResponseDto, data, TO_OPTS),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get('items/:id')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Chi tiết SupplierItem — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: SupplierItemResponseDto })
  async getSupplierItem(
    @Param('id') id: string,
  ): Promise<SupplierItemResponseDto> {
    const doc = await this.svc.getSupplierItem(id);
    return plainToInstance(SupplierItemResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch('items/:id')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật SupplierItem — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: SupplierItemResponseDto })
  async updateSupplierItem(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierItemDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<SupplierItemResponseDto> {
    const doc = await this.svc.updateSupplierItem(id, dto, actorId);
    return plainToInstance(SupplierItemResponseDto, doc.toObject(), TO_OPTS);
  }

  // ─── Supplier routes ──────────────────────────────────────────────────────

  @Post()
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Tạo nhà cung cấp — [MANAGER, ADMIN]' })
  @ApiCreatedResponse({ type: SupplierResponseDto })
  async createSupplier(
    @Body() dto: CreateSupplierDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<SupplierResponseDto> {
    const doc = await this.svc.createSupplier(dto, actorId);
    return plainToInstance(SupplierResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách NCC — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: [SupplierResponseDto] })
  async listSuppliers(@Query() query: QuerySupplierDto): Promise<{
    data: SupplierResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listSuppliers(query);
    return {
      data: plainToInstance(
        SupplierResponseDto,
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
  @ApiOperation({ summary: 'Chi tiết NCC — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: SupplierResponseDto })
  async getSupplier(@Param('id') id: string): Promise<SupplierResponseDto> {
    const doc = await this.svc.getSupplier(id);
    return plainToInstance(SupplierResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật thông tin NCC — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: SupplierResponseDto })
  async updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<SupplierResponseDto> {
    const doc = await this.svc.updateSupplier(id, dto, actorId);
    return plainToInstance(SupplierResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id/status')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Đổi trạng thái NCC — [MANAGER, ADMIN] (gỡ BLACKLIST: chỉ ADMIN)',
  })
  @ApiOkResponse({ type: SupplierResponseDto })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeSupplierStatusDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') role: WmsRole,
  ): Promise<SupplierResponseDto> {
    const doc = await this.svc.changeStatus(id, dto, actorId, role);
    return plainToInstance(SupplierResponseDto, doc.toObject(), TO_OPTS);
  }

  @Delete(':id')
  @Roles(WmsRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá NCC (soft-delete) — [ADMIN]' })
  @ApiNoContentResponse()
  async deleteSupplier(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteSupplier(id, actorId);
  }
}
