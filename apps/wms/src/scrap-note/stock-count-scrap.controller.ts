import {
  Body,
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
import { plainToInstance } from 'class-transformer';
import {
  CreateStockCountScrapFormDto,
  ScrapNoteResponseDto,
} from './dto/scrap-note.dto';
import { ScrapNoteService, UploadedImageFile } from './scrap-note.service';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('stock-counts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock-counts')
export class StockCountScrapController {
  constructor(private readonly service: ScrapNoteService) {}

  @Post(':id/items/:itemId/scrap')
  @Roles(WmsRole.COUNTER, WmsRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images'))
  @ApiOperation({
    summary: 'Tạo/cập nhật đề xuất hủy từ dòng đã kiểm — [COUNTER, ADMIN]',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['itemBarcode', 'shelfId', 'quantity', 'reason'],
      properties: {
        itemBarcode: { type: 'string' },
        shelfId: { type: 'string' },
        lotId: { type: 'string' },
        quantity: { type: 'integer', minimum: 1 },
        reason: { type: 'string' },
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @ApiOkResponse({ type: ScrapNoteResponseDto })
  async createFromStockCount(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreateStockCountScrapFormDto,
    @CurrentUser('sub') actorId: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ): Promise<ScrapNoteResponseDto> {
    const imageFiles: UploadedImageFile[] = files.map((file) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    }));
    const doc = await this.service.createFromStockCount(
      id,
      itemId,
      dto,
      actorId,
      imageFiles,
    );
    return plainToInstance(ScrapNoteResponseDto, doc.toObject(), TO_OPTS);
  }
}
