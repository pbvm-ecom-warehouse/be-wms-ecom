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
import { PutAwayService } from './put-away.service';
import {
  ConfirmPutAwayLineDto,
  PutAwayTaskResponseDto,
  QueryPutAwayTaskDto,
} from './dto/put-away.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('put-away')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('putaway-tasks')
export class PutAwayController {
  constructor(private readonly svc: PutAwayService) {}

  @Post(':id/confirm-line')
  @Roles(WmsRole.RECEIVER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Xác nhận 1 dòng put-away (quét SKU + shelf) — chuyển staging→shelf thật — [RECEIVER, ADMIN]',
  })
  @ApiOkResponse({ type: PutAwayTaskResponseDto })
  async confirmLine(
    @Param('id') id: string,
    @Body() dto: ConfirmPutAwayLineDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<PutAwayTaskResponseDto> {
    const doc = await this.svc.confirmLine(id, dto, actorId);
    return plainToInstance(PutAwayTaskResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.RECEIVER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách lệnh sắp xếp — [RECEIVER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [PutAwayTaskResponseDto] })
  async listTasks(@Query() query: QueryPutAwayTaskDto): Promise<{
    data: PutAwayTaskResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.listTasks(query);
    return {
      data: plainToInstance(
        PutAwayTaskResponseDto,
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
    summary: 'Chi tiết lệnh sắp xếp — [RECEIVER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: PutAwayTaskResponseDto })
  async getTask(@Param('id') id: string): Promise<PutAwayTaskResponseDto> {
    const doc = await this.svc.getTask(id);
    return plainToInstance(PutAwayTaskResponseDto, doc.toObject(), TO_OPTS);
  }
}
