// apps/wms/src/goods-receipt-note/goods-receipt-note.controller.ts
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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
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
import { GoodsReceiptNoteService } from './goods-receipt-note.service';
import {
  CreateGoodsReceiptNoteDto,
  GoodsReceiptNoteResponseDto,
  QueryGoodsReceiptNoteDto,
  RejectGoodsReceiptNoteDto,
  SubmitGoodsReceiptNoteDto,
  UpdateGoodsReceiptNoteItemsDto,
} from './dto/goods-receipt-note.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;
const MAX_GRN_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_GRN_IMAGE_COUNT = 10;

@ApiTags('goods-receipt-note')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goods-receipt-notes')
export class GoodsReceiptNoteController {
  constructor(private readonly svc: GoodsReceiptNoteService) {}

  @Post()
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @UseInterceptors(
    FilesInterceptor('images', MAX_GRN_IMAGE_COUNT, {
      limits: { fileSize: MAX_GRN_IMAGE_SIZE_BYTES },
    }),
  )
  @ApiOperation({
    summary:
      'Tạo phiếu nhập kho (GRN) theo PO, bắt buộc ảnh minh chứng — [RECEIVER, ADMIN]',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['purchaseOrderId', 'items', 'images'],
      properties: {
        purchaseOrderId: { type: 'string' },
        items: {
          type: 'string',
          description: 'JSON array các dòng hàng thực nhận',
        },
        images: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({ type: GoodsReceiptNoteResponseDto })
  async createGoodsReceiptNote(
    @Body() dto: CreateGoodsReceiptNoteDto,
    @CurrentUser('sub') actorId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<GoodsReceiptNoteResponseDto> {
    const imageFiles = (files ?? []).map((file) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    }));
    const doc = await this.svc.createGoodsReceiptNote(dto, actorId, imageFiles);
    const [plain] = await this.svc.attachDisplayInfo([doc]);
    return plainToInstance(GoodsReceiptNoteResponseDto, plain, TO_OPTS);
  }

  @Patch(':id/items')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Sửa toàn bộ dòng hàng của phiếu nhập còn DRAFT (thay thế, không cộng dồn) — [RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReceiptNoteResponseDto })
  async updateGoodsReceiptNoteItems(
    @Param('id') id: string,
    @Body() dto: UpdateGoodsReceiptNoteItemsDto,
  ): Promise<GoodsReceiptNoteResponseDto> {
    const doc = await this.svc.updateGoodsReceiptNoteItems(id, dto.items);
    const [plain] = await this.svc.attachDisplayInfo([doc]);
    return plainToInstance(GoodsReceiptNoteResponseDto, plain, TO_OPTS);
  }

  @Delete(':id')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xoá phiếu nhập còn DRAFT (xoá vật lý) — [RECEIVER, ADMIN]',
  })
  @ApiNoContentResponse()
  async deleteGoodsReceiptNote(@Param('id') id: string): Promise<void> {
    await this.svc.deleteGoodsReceiptNote(id);
  }

  @Post(':id/submit')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Gửi phiếu nhập kho chờ duyệt — chưa cộng tồn, chưa sinh put-away task — [RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReceiptNoteResponseDto })
  async submitGoodsReceiptNote(
    @Param('id') id: string,
    @Body() _dto: SubmitGoodsReceiptNoteDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsReceiptNoteResponseDto> {
    const doc = await this.svc.submitGoodsReceiptNote(id, actorId);
    const [plain] = await this.svc.attachDisplayInfo([doc]);
    return plainToInstance(GoodsReceiptNoteResponseDto, plain, TO_OPTS);
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
    const [plain] = await this.svc.attachDisplayInfo([doc]);
    return plainToInstance(GoodsReceiptNoteResponseDto, plain, TO_OPTS);
  }

  @Post(':id/reject')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Từ chối phiếu nhập kho, trả về Receiver sửa và gửi lại — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: GoodsReceiptNoteResponseDto })
  async rejectGoodsReceiptNote(
    @Param('id') id: string,
    @Body() dto: RejectGoodsReceiptNoteDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GoodsReceiptNoteResponseDto> {
    const doc = await this.svc.rejectGoodsReceiptNote(id, actorId, dto.reason);
    const [plain] = await this.svc.attachDisplayInfo([doc]);
    return plainToInstance(GoodsReceiptNoteResponseDto, plain, TO_OPTS);
  }
  @Post(':id/images')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_GRN_IMAGE_SIZE_BYTES },
    }),
  )
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
    const [plain] = await this.svc.attachDisplayInfo([doc]);
    return plainToInstance(GoodsReceiptNoteResponseDto, plain, TO_OPTS);
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
    const plainList = await this.svc.attachDisplayInfo(data);
    return {
      data: plainToInstance(GoodsReceiptNoteResponseDto, plainList, TO_OPTS),
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
    const [plain] = await this.svc.attachDisplayInfo([doc]);
    return plainToInstance(GoodsReceiptNoteResponseDto, plain, TO_OPTS);
  }
}
