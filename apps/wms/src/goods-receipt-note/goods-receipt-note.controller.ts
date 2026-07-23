// apps/wms/src/goods-receipt-note/goods-receipt-note.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
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
import { GoodsReceiptNoteService } from './goods-receipt-note.service';
import {
  CreateGoodsReceiptNoteDto,
  GoodsReceiptNoteResponseDto,
  QueryGoodsReceiptNoteDto,
} from './dto/goods-receipt-note.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('goods-receipt-note')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goods-receipt-notes')
export class GoodsReceiptNoteController {
  constructor(private readonly svc: GoodsReceiptNoteService) {}

  @Post()
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Tạo phiếu nhập kho (GRN) theo PO — [RECEIVER, ADMIN]',
  })
  @ApiCreatedResponse({ type: GoodsReceiptNoteResponseDto })
  async createGoodsReceiptNote(
    @Body() dto: CreateGoodsReceiptNoteDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsReceiptNoteResponseDto> {
    const doc = await this.svc.createGoodsReceiptNote(dto, actorId);
    return plainToInstance(
      GoodsReceiptNoteResponseDto,
      doc.toObject(),
      TO_OPTS,
    );
  }

  @Post(':id/confirm')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Xác nhận nhận hàng — cộng tồn 2 lớp + cập nhật PO — [RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReceiptNoteResponseDto })
  async confirmGoodsReceiptNote(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsReceiptNoteResponseDto> {
    const doc = await this.svc.confirmGoodsReceiptNote(id, actorId);
    return plainToInstance(
      GoodsReceiptNoteResponseDto,
      doc.toObject(),
      TO_OPTS,
    );
  }

  @Post(':id/approve')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Duyệt phiếu nhập kho (audit) — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: GoodsReceiptNoteResponseDto })
  async approveGoodsReceiptNote(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsReceiptNoteResponseDto> {
    const doc = await this.svc.approveGoodsReceiptNote(id, actorId);
    return plainToInstance(
      GoodsReceiptNoteResponseDto,
      doc.toObject(),
      TO_OPTS,
    );
  }

  @Post(':id/images')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Upload ảnh minh chứng nhập kho lên Cloudinary — [RECEIVER, ADMIN]',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: GoodsReceiptNoteResponseDto })
  async uploadGrnImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<GoodsReceiptNoteResponseDto> {
    const doc = await this.svc.uploadGrnImage(id, file);
    return plainToInstance(
      GoodsReceiptNoteResponseDto,
      doc.toObject(),
      TO_OPTS,
    );
  }

  @Get()
  @Roles(WmsRole.RECEIVER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách phiếu nhập kho — [RECEIVER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [GoodsReceiptNoteResponseDto] })
  async listGoodsReceiptNotes(
    @Query() query: QueryGoodsReceiptNoteDto,
  ): Promise<{
    data: GoodsReceiptNoteResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listGoodsReceiptNotes(query);
    return {
      data: plainToInstance(
        GoodsReceiptNoteResponseDto,
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
    summary: 'Chi tiết phiếu nhập kho — [RECEIVER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReceiptNoteResponseDto })
  async getGoodsReceiptNote(
    @Param('id') id: string,
  ): Promise<GoodsReceiptNoteResponseDto> {
    const doc = await this.svc.getGoodsReceiptNote(id);
    return plainToInstance(
      GoodsReceiptNoteResponseDto,
      doc.toObject(),
      TO_OPTS,
    );
  }
}
