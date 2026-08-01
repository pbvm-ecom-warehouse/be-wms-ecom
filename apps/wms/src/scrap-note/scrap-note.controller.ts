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
import { ScrapNoteService } from './scrap-note.service';
import {
  MoveScrapItemDto,
  QueryScrapNoteDto,
  RejectScrapNoteDto,
  ScrapNoteResponseDto,
} from './dto/scrap-note.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('scrap-notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scrap-notes')
export class ScrapNoteController {
  constructor(private readonly svc: ScrapNoteService) {}

  @Get()
  @Roles(WmsRole.COUNTER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách phiếu hủy hàng — [COUNTER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [ScrapNoteResponseDto] })
  async listScrapNotes(@Query() query: QueryScrapNoteDto): Promise<{
    data: ScrapNoteResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listScrapNotes({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: plainToInstance(
        ScrapNoteResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.COUNTER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết phiếu hủy hàng — [COUNTER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: ScrapNoteResponseDto })
  async getScrapNote(@Param('id') id: string): Promise<ScrapNoteResponseDto> {
    const doc = await this.svc.getScrapNote(id);
    return plainToInstance(ScrapNoteResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/approve')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Duyệt phiếu hủy hàng — trừ tồn thật, ghi SCRAP movement — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: ScrapNoteResponseDto })
  async approveScrapNote(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<ScrapNoteResponseDto> {
    const doc = await this.svc.approveScrapNote(id, actorId);
    return plainToInstance(ScrapNoteResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/reject')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Từ chối phiếu hủy hàng — không đụng tồn kho — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: ScrapNoteResponseDto })
  async rejectScrapNote(
    @Param('id') id: string,
    @Body() dto: RejectScrapNoteDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<ScrapNoteResponseDto> {
    const doc = await this.svc.rejectScrapNote(id, dto, actorId);
    return plainToInstance(ScrapNoteResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/items/:itemId/move-to-scrap')
  @Roles(WmsRole.COUNTER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Quét hàng + khoang nguồn + khoang khu hủy để chuyển dòng — [COUNTER, ADMIN]',
  })
  @ApiOkResponse({ type: ScrapNoteResponseDto })
  async moveItemToScrap(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: MoveScrapItemDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<ScrapNoteResponseDto> {
    const doc = await this.svc.moveItemToScrap(id, itemId, dto, actorId);
    return plainToInstance(ScrapNoteResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/dispose')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Xác nhận đã tiêu hủy hàng trong khu SCRAP — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: ScrapNoteResponseDto })
  async disposeScrapNote(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<ScrapNoteResponseDto> {
    const doc = await this.svc.disposeScrapNote(id, actorId);
    return plainToInstance(ScrapNoteResponseDto, doc.toObject(), TO_OPTS);
  }
}
