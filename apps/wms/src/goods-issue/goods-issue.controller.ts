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
import { GoodsIssueService } from './goods-issue.service';
import {
  ConfirmGoodsIssueLineDto,
  GoodsIssueResponseDto,
  PickSuggestionResponseDto,
  QueryGoodsIssueDto,
} from './dto/goods-issue.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('goods-issues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goods-issues')
export class GoodsIssueController {
  constructor(private readonly svc: GoodsIssueService) {}

  @Get()
  @Roles(WmsRole.PICKER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách phiếu xuất kho — [PICKER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [GoodsIssueResponseDto] })
  async listGoodsIssues(@Query() query: QueryGoodsIssueDto): Promise<{
    data: GoodsIssueResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listGoodsIssues(query);
    return {
      data: plainToInstance(
        GoodsIssueResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.PICKER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết phiếu xuất kho — [PICKER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsIssueResponseDto })
  async getGoodsIssue(@Param('id') id: string): Promise<GoodsIssueResponseDto> {
    const doc = await this.svc.getGoodsIssue(id);
    return plainToInstance(GoodsIssueResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get(':id/items/:itemId/suggestions')
  @Roles(WmsRole.PICKER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Gợi ý vị trí pick (FEFO nếu hàng có hạn sử dụng) — [PICKER, ADMIN]',
  })
  @ApiOkResponse({ type: [PickSuggestionResponseDto] })
  async getPickSuggestions(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<PickSuggestionResponseDto[]> {
    const suggestions = await this.svc.getPickSuggestions(id, itemId);
    return plainToInstance(PickSuggestionResponseDto, suggestions, TO_OPTS);
  }

  @Post(':id/confirm-line')
  @Roles(WmsRole.PICKER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Xác nhận 1 dòng xuất kho (quét SKU + shelf) — trừ onHand+reserved — [PICKER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsIssueResponseDto })
  async confirmLine(
    @Param('id') id: string,
    @Body() dto: ConfirmGoodsIssueLineDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsIssueResponseDto> {
    const doc = await this.svc.confirmLine(id, dto, actorId);
    return plainToInstance(GoodsIssueResponseDto, doc.toObject(), TO_OPTS);
  }
}
