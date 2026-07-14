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
import { PrintJobService } from './print-job.service';
import {
  CompletePrintJobItemDto,
  ConsumePrintJobItemDto,
  PrintJobResponseDto,
  QueryPrintJobDto,
} from './dto/print-job.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('print-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('print-jobs')
export class PrintJobController {
  constructor(private readonly svc: PrintJobService) {}

  @Get()
  @Roles(WmsRole.MANAGER, WmsRole.PRINTER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách lệnh in — [MANAGER, PRINTER, ADMIN]',
  })
  @ApiOkResponse({ type: [PrintJobResponseDto] })
  async listPrintJobs(@Query() query: QueryPrintJobDto): Promise<{
    data: PrintJobResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listPrintJobs(query);
    return {
      data: plainToInstance(
        PrintJobResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.MANAGER, WmsRole.PRINTER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết lệnh in — [MANAGER, PRINTER, ADMIN]',
  })
  @ApiOkResponse({ type: PrintJobResponseDto })
  async getPrintJob(@Param('id') id: string): Promise<PrintJobResponseDto> {
    const doc = await this.svc.getPrintJob(id);
    return plainToInstance(PrintJobResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/items/:itemId/consume')
  @Roles(WmsRole.PRINTER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Quét CUP_BLANK+shelf, bắt đầu in — trừ onHand+reserved thật — [PRINTER, ADMIN]',
  })
  @ApiOkResponse({ type: PrintJobResponseDto })
  async consumeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: ConsumePrintJobItemDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<PrintJobResponseDto> {
    const doc = await this.svc.consumeItem(id, itemId, dto, actorId);
    return plainToInstance(PrintJobResponseDto, doc.toObject(), TO_OPTS);
  }

  @Post(':id/items/:itemId/complete')
  @Roles(WmsRole.PRINTER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Xác nhận in xong, nhập CUP_PRINTED giữ reserve cho đơn — [PRINTER, ADMIN]',
  })
  @ApiOkResponse({ type: PrintJobResponseDto })
  async completeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CompletePrintJobItemDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<PrintJobResponseDto> {
    const doc = await this.svc.completeItem(id, itemId, dto, actorId);
    return plainToInstance(PrintJobResponseDto, doc.toObject(), TO_OPTS);
  }
}
