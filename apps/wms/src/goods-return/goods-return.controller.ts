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
import { GoodsReturnService } from './goods-return.service';
import {
  CreateGoodsReturnDto,
  GoodsReturnResponseDto,
  InspectGoodsReturnDto,
  QueryGoodsReturnDto,
} from './dto/goods-return.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('goods-returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goods-returns')
export class GoodsReturnController {
  constructor(private readonly svc: GoodsReturnService) {}

  @Post()
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Tạo phiếu hoàn hàng thủ công — [RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReturnResponseDto })
  async createGoodsReturn(
    @Body() dto: CreateGoodsReturnDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsReturnResponseDto> {
    const doc = await this.svc.createGoodsReturn(dto, actorId);
    return plainToInstance(GoodsReturnResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.RECEIVER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách phiếu hoàn hàng — [RECEIVER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [GoodsReturnResponseDto] })
  async listGoodsReturns(@Query() query: QueryGoodsReturnDto): Promise<{
    data: GoodsReturnResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listGoodsReturns({
      status: query.status,
      warehouseId: query.warehouseId
        ? new Types.ObjectId(query.warehouseId)
        : undefined,
      orderId: query.orderId,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: plainToInstance(
        GoodsReturnResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.RECEIVER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết phiếu hoàn hàng — [RECEIVER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReturnResponseDto })
  async getGoodsReturn(
    @Param('id') id: string,
  ): Promise<GoodsReturnResponseDto> {
    const doc = await this.svc.getGoodsReturn(id);
    return plainToInstance(GoodsReturnResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/inspect')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Gán kho + phân loại GOOD/DAMAGED từng dòng — [RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReturnResponseDto })
  async inspectGoodsReturn(
    @Param('id') id: string,
    @Body() dto: InspectGoodsReturnDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsReturnResponseDto> {
    const doc = await this.svc.inspectGoodsReturn(id, dto, actorId);
    return plainToInstance(GoodsReturnResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/confirm')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Xác nhận — nhập lại hàng tốt, nhập tạm+hủy hàng hỏng — [RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReturnResponseDto })
  async confirmGoodsReturn(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsReturnResponseDto> {
    const doc = await this.svc.confirmGoodsReturn(id, actorId);
    return plainToInstance(GoodsReturnResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/cancel')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Huỷ phiếu (chỉ khi DRAFT/INSPECTED) — [RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReturnResponseDto })
  async cancelGoodsReturn(
    @Param('id') id: string,
  ): Promise<GoodsReturnResponseDto> {
    const doc = await this.svc.cancelGoodsReturn(id);
    return plainToInstance(GoodsReturnResponseDto, doc.toObject(), TO_OPTS);
  }
}
