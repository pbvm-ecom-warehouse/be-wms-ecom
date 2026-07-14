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
import { Types } from 'mongoose';
import { StockCountService } from './stock-count.service';
import {
  ApproveStockCountDto,
  CountStockCountItemDto,
  CreateStockCountDto,
  QueryStockCountDto,
  StockCountResponseDto,
} from './dto/stock-count.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('stock-counts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock-counts')
export class StockCountController {
  constructor(private readonly svc: StockCountService) {}

  @Post()
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Tạo phiếu kiểm kho (auto-generate dòng) — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: StockCountResponseDto })
  async createStockCount(
    @Body() dto: CreateStockCountDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<StockCountResponseDto> {
    const doc = await this.svc.createStockCount(dto, actorId);
    return plainToInstance(StockCountResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.MANAGER, WmsRole.COUNTER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách phiếu kiểm kho — [MANAGER, COUNTER, ADMIN]',
  })
  @ApiOkResponse({ type: [StockCountResponseDto] })
  async listStockCounts(@Query() query: QueryStockCountDto): Promise<{
    data: StockCountResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listStockCounts({
      status: query.status,
      warehouseId: query.warehouseId
        ? new Types.ObjectId(query.warehouseId)
        : undefined,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: plainToInstance(
        StockCountResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.MANAGER, WmsRole.COUNTER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Chi tiết phiếu kiểm kho + báo cáo chênh lệch — [MANAGER, COUNTER, ADMIN]',
  })
  @ApiOkResponse({ type: StockCountResponseDto })
  async getStockCount(@Param('id') id: string): Promise<StockCountResponseDto> {
    const doc = await this.svc.getStockCount(id);
    return plainToInstance(StockCountResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/items/:itemId/count')
  @Roles(WmsRole.COUNTER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Nhập số đếm thực cho 1 dòng — [COUNTER, ADMIN]',
  })
  @ApiOkResponse({ type: StockCountResponseDto })
  async countItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CountStockCountItemDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<StockCountResponseDto> {
    const doc = await this.svc.countItem(id, itemId, dto, actorId);
    return plainToInstance(StockCountResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/approve')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Duyệt điều chỉnh cho cả phiếu — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: StockCountResponseDto })
  async approveStockCount(
    @Param('id') id: string,
    @Body() dto: ApproveStockCountDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<StockCountResponseDto> {
    const doc = await this.svc.approveStockCount(id, dto, actorId);
    return plainToInstance(StockCountResponseDto, doc.toObject(), TO_OPTS);
  }
}
