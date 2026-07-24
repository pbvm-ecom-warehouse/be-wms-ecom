import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { AppException } from '@app/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ScrapNoteService, type UploadedImageFile } from './scrap-note.service';
import {
  CreateScrapNoteDto,
  CreateScrapNoteFormDto,
  CreateScrapNoteItemDto,
  QueryScrapNoteDto,
  RejectScrapNoteDto,
  ScrapNoteResponseDto,
} from './dto/scrap-note.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

/**
 * Field ảnh multipart đặt tên `images_<index>` (index = vị trí dòng trong mảng
 * items) để map đúng ảnh về đúng dòng — 1 dòng có thể có nhiều ảnh. Field khác
 * (không khớp pattern) bị bỏ qua, không lỗi (COUNTER/RECEIVER có thể gửi thừa
 * field lạ).
 */
const IMAGE_FIELD_PATTERN = /^images_(\d+)$/;

function groupImagesByIndex(
  files: Express.Multer.File[] | undefined,
): Map<number, UploadedImageFile[]> {
  const grouped = new Map<number, UploadedImageFile[]>();
  for (const file of files ?? []) {
    const match = IMAGE_FIELD_PATTERN.exec(file.fieldname);
    if (!match) continue;
    const index = Number(match[1]);
    const list = grouped.get(index) ?? [];
    list.push({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    });
    grouped.set(index, list);
  }
  return grouped;
}

@ApiTags('scrap-notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scrap-notes')
export class ScrapNoteController {
  constructor(private readonly svc: ScrapNoteService) {}

  @Post()
  @Roles(WmsRole.COUNTER, WmsRole.RECEIVER, WmsRole.ADMIN)
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({
    summary:
      'Tạo phiếu đề xuất hủy hàng (kèm toàn bộ dòng) — [COUNTER, RECEIVER, ADMIN]',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'items: JSON string của mảng CreateScrapNoteItemDto. ' +
      'Ảnh minh chứng theo dòng (optional): field images_<index> ' +
      '(index = vị trí dòng trong items, có thể nhiều field cùng index).',
    schema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        items: { type: 'string' },
        images_0: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: ScrapNoteResponseDto })
  async createScrapNote(
    @Body() form: CreateScrapNoteFormDto,
    @CurrentUser('sub') actorId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<ScrapNoteResponseDto> {
    const dto = await this.parseAndValidateItems(form);
    const imagesByIndex = groupImagesByIndex(files);
    const doc = await this.svc.createScrapNote(dto, actorId, imagesByIndex);
    return plainToInstance(ScrapNoteResponseDto, doc.toObject(), TO_OPTS);
  }

  /**
   * `items` đến dưới dạng JSON string trong multipart form field (ValidationPipe
   * global không parse JSON lồng trong multipart) — parse + validate thủ công
   * bằng đúng class CreateScrapNoteItemDto để giữ nguyên rule validate hiện có.
   */
  private async parseAndValidateItems(
    form: CreateScrapNoteFormDto,
  ): Promise<CreateScrapNoteDto> {
    let rawItems: unknown;
    try {
      rawItems = JSON.parse(form.items);
    } catch {
      throw new AppException(
        'VALIDATION_FAILED',
        'items không phải JSON hợp lệ',
      );
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new AppException(
        'VALIDATION_FAILED',
        'items phải là mảng khác rỗng',
      );
    }

    const items = plainToInstance(CreateScrapNoteItemDto, rawItems);
    for (const item of items) {
      const errors = await validate(item);
      if (errors.length > 0) {
        throw new AppException(
          'VALIDATION_FAILED',
          'Dữ liệu items không hợp lệ',
        );
      }
    }

    const dto = new CreateScrapNoteDto();
    dto.note = form.note;
    dto.items = items;
    return dto;
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
