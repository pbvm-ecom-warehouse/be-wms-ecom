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
import {
  GoodsReturnService,
  type UploadedImageFile,
} from './goods-return.service';
import {
  CreateGoodsReturnDto,
  GoodsReturnResponseDto,
  InspectGoodsReturnDto,
  InspectGoodsReturnFormDto,
  InspectGoodsReturnItemDto,
  QueryGoodsReturnDto,
} from './dto/goods-return.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

/**
 * Field ảnh multipart đặt tên `images_<index>` (index = vị trí dòng trong mảng
 * items) để map đúng ảnh về đúng dòng — 1 dòng có thể có nhiều ảnh. Field khác
 * (không khớp pattern) bị bỏ qua, không lỗi (RECEIVER có thể gửi thừa field lạ).
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
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({
    summary: 'Gán kho + phân loại GOOD/DAMAGED từng dòng — [RECEIVER, ADMIN]',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'items: JSON string của mảng InspectGoodsReturnItemDto. ' +
      'Ảnh minh chứng theo dòng (optional): field images_<index> ' +
      '(index = vị trí dòng trong items, có thể nhiều field cùng index).',
    schema: {
      type: 'object',
      properties: {
        items: { type: 'string' },
        images_0: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: GoodsReturnResponseDto })
  async inspectGoodsReturn(
    @Param('id') id: string,
    @Body() form: InspectGoodsReturnFormDto,
    @CurrentUser('sub') actorId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<GoodsReturnResponseDto> {
    const dto = await this.parseAndValidateItems(form);
    const imagesByIndex = groupImagesByIndex(files);
    const imagesByItemId = new Map<string, UploadedImageFile[]>();
    dto.items.forEach((item, index) => {
      const images = imagesByIndex.get(index);
      if (images) imagesByItemId.set(item.itemId, images);
    });

    const doc = await this.svc.inspectGoodsReturn(
      id,
      dto,
      actorId,
      imagesByItemId,
    );
    return plainToInstance(GoodsReturnResponseDto, doc.toObject(), TO_OPTS);
  }

  /**
   * `items` đến dưới dạng JSON string trong multipart form field (ValidationPipe
   * global không parse JSON lồng trong multipart) — parse + validate thủ công
   * bằng đúng class InspectGoodsReturnItemDto để giữ nguyên rule validate hiện có.
   */
  private async parseAndValidateItems(
    form: InspectGoodsReturnFormDto,
  ): Promise<InspectGoodsReturnDto> {
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

    const items = plainToInstance(InspectGoodsReturnItemDto, rawItems);
    for (const item of items) {
      const errors = await validate(item);
      if (errors.length > 0) {
        throw new AppException(
          'VALIDATION_FAILED',
          'Dữ liệu items không hợp lệ',
        );
      }
    }

    const dto = new InspectGoodsReturnDto();
    dto.items = items;
    return dto;
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
