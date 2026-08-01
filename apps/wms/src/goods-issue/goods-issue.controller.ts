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
  AssignGoodsIssueDto,
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
  @Roles(WmsRole.SHIPPER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách phiếu xuất kho — [SHIPPER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [GoodsIssueResponseDto] })
  async listGoodsIssues(
    @Query() query: QueryGoodsIssueDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<{
    data: GoodsIssueResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listGoodsIssues(
      query,
      actorId,
      actorRole,
    );
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
  @Roles(WmsRole.SHIPPER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết phiếu xuất kho — [SHIPPER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsIssueResponseDto })
  async getGoodsIssue(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<GoodsIssueResponseDto> {
    const doc = await this.svc.getGoodsIssue(id, actorId, actorRole);
    return plainToInstance(GoodsIssueResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/assign')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Admin/Manager gán phiếu xuất cho Shipper — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsIssueResponseDto })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignGoodsIssueDto,
  ): Promise<GoodsIssueResponseDto> {
    const doc = await this.svc.assign(id, dto.shipperId);
    return plainToInstance(GoodsIssueResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get(':id/items/:itemId/suggestions')
  @Roles(WmsRole.SHIPPER)
  @ApiOperation({
    summary: 'Gợi ý vị trí pick FEFO — [SHIPPER được gán]',
  })
  @ApiOkResponse({ type: [PickSuggestionResponseDto] })
  async getPickSuggestions(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<PickSuggestionResponseDto[]> {
    const suggestions = await this.svc.getPickSuggestions(
      id,
      itemId,
      actorId,
      actorRole,
    );
    return plainToInstance(PickSuggestionResponseDto, suggestions, TO_OPTS);
  }

  @Post(':id/confirm-line')
  @Roles(WmsRole.SHIPPER)
  @ApiOperation({
    summary: 'Xác nhận 1 dòng xuất kho (quét item + cell) — [SHIPPER được gán]',
  })
  @ApiOkResponse({ type: GoodsIssueResponseDto })
  async confirmLine(
    @Param('id') id: string,
    @Body() dto: ConfirmGoodsIssueLineDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<GoodsIssueResponseDto> {
    const doc = await this.svc.confirmLine(id, dto, actorId, actorRole);
    return plainToInstance(GoodsIssueResponseDto, doc.toObject(), TO_OPTS);
  }
}
