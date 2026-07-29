import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { ShipmentService, type UploadedImageFile } from './shipment.service';
import {
  AssignShipmentDto,
  CreateShipmentPackageDto,
  UpdateShipmentStatusFormDto,
  QueryShipmentDto,
  ShipmentResponseDto,
} from './dto/shipment.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shipments')
export class ShipmentController {
  constructor(private readonly svc: ShipmentService) {}

  @Get()
  @Roles(WmsRole.SHIPPER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách vận đơn — [SHIPPER, MANAGER, ADMIN]' })
  @ApiOkResponse({ type: [ShipmentResponseDto] })
  async list(
    @Query() query: QueryShipmentDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<{
    data: ShipmentResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.list(query, actorId, actorRole);
    return {
      data: plainToInstance(
        ShipmentResponseDto,
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
  @ApiOperation({ summary: 'Chi tiết vận đơn — [SHIPPER, MANAGER, ADMIN]' })
  @ApiOkResponse({ type: ShipmentResponseDto })
  async getById(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<ShipmentResponseDto> {
    const doc = await this.svc.getByIdForActor(id, actorId, actorRole);
    return plainToInstance(ShipmentResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/packages')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Đóng một kiện từ allocations đã pick; barcode do WMS sinh — [SHIPPER owner, ADMIN]',
  })
  @ApiOkResponse({ type: ShipmentResponseDto })
  async createPackage(
    @Param('id') id: string,
    @Body() dto: CreateShipmentPackageDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<ShipmentResponseDto> {
    const doc = await this.svc.createPackage(id, dto, actorId, actorRole);
    return plainToInstance(ShipmentResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id/assign')
  @Roles(WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Legacy: gán hãng vận chuyển + tracking — [ADMIN]',
  })
  @ApiOkResponse({ type: ShipmentResponseDto })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignShipmentDto,
  ): Promise<ShipmentResponseDto> {
    const doc = await this.svc.assignCarrier(
      id,
      dto.carrierId,
      dto.trackingNumber,
    );
    return plainToInstance(ShipmentResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id/status')
  @Roles(WmsRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images'))
  @ApiOperation({ summary: 'Legacy: cập nhật trạng thái giao hàng — [ADMIN]' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'Ảnh POD (proof-of-delivery, optional, chỉ có ý nghĩa khi status=DELIVERED): ' +
      'field `images`, có thể nhiều file.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        note: { type: 'string' },
        failReason: { type: 'string' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOkResponse({ type: ShipmentResponseDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusFormDto,
    @CurrentUser('sub') actorId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<ShipmentResponseDto> {
    const imageFiles: UploadedImageFile[] = (files ?? []).map((file) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    }));
    const doc = await this.svc.updateStatus(
      id,
      dto.status,
      actorId,
      { note: dto.note, failReason: dto.failReason },
      imageFiles,
    );
    return plainToInstance(ShipmentResponseDto, doc.toObject(), TO_OPTS);
  }
}
