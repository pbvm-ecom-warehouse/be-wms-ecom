import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { DeliveryTripResponseDto } from './dto/delivery-trip.dto';
import {
  DeliverShipmentFormDto,
  DeliveryIncidentResponseDto,
  DeliveryOtpResponseDto,
  FailedDeliveryAttemptDto,
  ReportDeliveryIncidentDto,
  ResolveDeliveryIncidentDto,
  ReturnPackageScanDto,
  SettleTripCashDto,
} from './dto/last-mile-delivery.dto';
import { LastMileDeliveryService } from './last-mile-delivery.service';
import type { UploadedImageFile } from './shipment.service';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('delivery-trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('delivery-trips')
export class LastMileDeliveryController {
  constructor(private readonly service: LastMileDeliveryService) {}

  @Post(':id/shipments/:shipmentId/delivery-otp')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Gửi OTP giao hàng qua notification; response không chứa OTP — [SHIPPER owner, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryOtpResponseDto })
  requestOtp(
    @Param('id') id: string,
    @Param('shipmentId') shipmentId: string,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryOtpResponseDto> {
    return this.service.requestOtp(id, shipmentId, actorId, actorRole);
  }

  @Post(':id/shipments/:shipmentId/deliver')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 5))
  @ApiOperation({
    summary:
      'Xác nhận giao bằng OTP + POD; ghi COD CASH/ECOM_QR — [SHIPPER owner, ADMIN]',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['otp', 'images'],
      properties: {
        otp: { type: 'string', example: '123456' },
        codCollectionMethod: {
          type: 'string',
          enum: ['CASH', 'ECOM_QR'],
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async deliver(
    @Param('id') id: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: DeliverShipmentFormDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<DeliveryTripResponseDto> {
    const imageFiles: UploadedImageFile[] = (files ?? []).map((file) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    }));
    const trip = await this.service.deliver(
      id,
      shipmentId,
      actorId,
      actorRole,
      dto.otp,
      dto.codCollectionMethod,
      imageFiles,
    );
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/shipments/:shipmentId/fail-attempt')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Ghi nhận lần giao thất bại; lần thứ 3 tự chuyển RETURNING — [SHIPPER owner, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async failAttempt(
    @Param('id') id: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: FailedDeliveryAttemptDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.recordFailedAttempt(
      id,
      shipmentId,
      actorId,
      actorRole,
      dto.reason,
    );
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/shipments/:shipmentId/return/packages/scan')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Quét kiện hoàn về kho — [SHIPPER owner, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async scanReturnPackage(
    @Param('id') id: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: ReturnPackageScanDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.scanReturnPackage(
      id,
      shipmentId,
      dto.barcode,
      actorId,
      actorRole,
    );
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/shipments/:shipmentId/return/handoff')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Bàn giao sau khi quét đủ kiện; tạo phiếu hoàn cho Receiver inspect — [SHIPPER owner, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async completeReturnHandoff(
    @Param('id') id: string,
    @Param('shipmentId') shipmentId: string,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.completeReturnHandoff(
      id,
      shipmentId,
      actorId,
      actorRole,
    );
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/settle-cash')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Đối soát đúng tiền mặt Shipper đã thu — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryTripResponseDto })
  async settleCash(
    @Param('id') id: string,
    @Body() dto: SettleTripCashDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<DeliveryTripResponseDto> {
    const trip = await this.service.settleCash(id, dto.amount, actorId);
    return plainToInstance(DeliveryTripResponseDto, trip.toObject(), TO_OPTS);
  }

  @Post(':id/incidents')
  @Roles(WmsRole.SHIPPER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Báo sự cố và tạm dừng chuyến — [SHIPPER owner, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryIncidentResponseDto })
  async reportIncident(
    @Param('id') id: string,
    @Body() dto: ReportDeliveryIncidentDto,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryIncidentResponseDto> {
    const incident = await this.service.reportIncident(
      id,
      dto,
      actorId,
      actorRole,
    );
    return plainToInstance(
      DeliveryIncidentResponseDto,
      incident.toObject(),
      TO_OPTS,
    );
  }

  @Get(':id/incidents')
  @Roles(WmsRole.SHIPPER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Lịch sử sự cố chuyến — [SHIPPER owner, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [DeliveryIncidentResponseDto] })
  async listIncidents(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
    @CurrentUser('role') actorRole: WmsRole,
  ): Promise<DeliveryIncidentResponseDto[]> {
    const incidents = await this.service.listIncidents(id, actorId, actorRole);
    return plainToInstance(
      DeliveryIncidentResponseDto,
      incidents.map((incident) => incident.toObject()),
      TO_OPTS,
    );
  }

  @Patch(':id/incidents/:incidentId/resolve')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Xử lý sự cố: tiếp tục, Shipper cứu hộ hoặc trả kho — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: DeliveryIncidentResponseDto })
  async resolveIncident(
    @Param('id') id: string,
    @Param('incidentId') incidentId: string,
    @Body() dto: ResolveDeliveryIncidentDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<DeliveryIncidentResponseDto> {
    const incident = await this.service.resolveIncident(
      id,
      incidentId,
      dto,
      actorId,
    );
    return plainToInstance(
      DeliveryIncidentResponseDto,
      incident.toObject(),
      TO_OPTS,
    );
  }
}
