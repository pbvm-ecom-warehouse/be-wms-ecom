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
import { ScrapNoteService } from './scrap-note.service';
import {
  CreateScrapNoteDto,
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

  @Post()
  @Roles(WmsRole.COUNTER, WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Tạo phiếu đề xuất hủy hàng (kèm toàn bộ dòng) — [COUNTER, RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: ScrapNoteResponseDto })
  async createScrapNote(
    @Body() dto: CreateScrapNoteDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<ScrapNoteResponseDto> {
    const doc = await this.svc.createScrapNote(dto, actorId);
    return plainToInstance(ScrapNoteResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.COUNTER, WmsRole.RECEIVER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách phiếu hủy hàng — [COUNTER, RECEIVER, MANAGER, ADMIN]',
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
      warehouseId: query.warehouseId
        ? new Types.ObjectId(query.warehouseId)
        : undefined,
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
  @Roles(WmsRole.COUNTER, WmsRole.RECEIVER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết phiếu hủy hàng — [COUNTER, RECEIVER, MANAGER, ADMIN]',
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
}
