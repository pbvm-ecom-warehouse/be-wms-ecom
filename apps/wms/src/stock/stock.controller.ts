// apps/wms/src/stock/stock.controller.ts
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { StockService, type UploadedImageFile } from './stock.service';
import {
  CreateWarehouseItemDto,
  UpdateWarehouseItemDto,
} from './dto/create-warehouse-item.dto';
import { QueryWarehouseItemDto } from './dto/query-warehouse-item.dto';
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
  @UseInterceptors(FilesInterceptor('images'))
  @ApiOperation({
    summary:
      'Tạo mặt hàng kho mới (CUP_BLANK/MATERIAL/PACKAGING) — BE tự sinh sku/barcode từ template — [ADMIN, MANAGER]',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Ảnh mặt hàng (optional): field `images`, có thể nhiều file.',
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['CUP_BLANK', 'MATERIAL', 'PACKAGING'] },
        templateId: { type: 'string' },
        attributeOptionIds: { type: 'array', items: { type: 'string' } },
        name: { type: 'string' },
        unit: { type: 'string' },
        altUnits: { type: 'array', items: { type: 'object' } },
        isPerishable: { type: 'boolean' },
        nearExpiryDays: { type: 'number' },
        minQuantity: { type: 'number' },
        depth: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({ type: WarehouseItemResponseDto })
  async create(
    @Body() dto: CreateWarehouseItemDto,
    @CurrentUser('sub') actorId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<WarehouseItemResponseDto> {
    const imageFiles: UploadedImageFile[] = (files ?? []).map((file) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    }));
    const doc = await this.svc.createWarehouseItem(dto, actorId, imageFiles);
    return plainToInstance(WarehouseItemResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary: 'Danh sách mặt hàng kho — [ADMIN, MANAGER]',
  })
  @ApiOkResponse({ type: [WarehouseItemResponseDto] })
  async list(@Query() query: QueryWarehouseItemDto): Promise<{
    data: WarehouseItemResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listWarehouseItems(query);
    return {
      data: plainToInstance(
        WarehouseItemResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết mặt hàng kho — [ADMIN, MANAGER]' })
  @ApiOkResponse({ type: WarehouseItemResponseDto })
  async getOne(@Param('id') id: string): Promise<WarehouseItemResponseDto> {
    const doc = await this.svc.getWarehouseItem(id);
    return plainToInstance(WarehouseItemResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary: 'Cập nhật mặt hàng kho (không sửa sku) — [ADMIN, MANAGER]',
  })
  @ApiOkResponse({ type: WarehouseItemResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseItemDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<WarehouseItemResponseDto> {
    const doc = await this.svc.updateWarehouseItem(id, dto, actorId);
    return plainToInstance(WarehouseItemResponseDto, doc.toObject(), TO_OPTS);
  }

  @Delete(':id')
  @Roles(WmsRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá mặt hàng kho (soft-delete) — [ADMIN]' })
  @ApiNoContentResponse()
  async remove(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteWarehouseItem(id, actorId);
  }
}
