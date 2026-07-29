import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
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
import { CarrierService } from './carrier.service';
import {
  CreateCarrierDto,
  UpdateCarrierDto,
  QueryCarrierDto,
  CarrierResponseDto,
} from './dto/carrier.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('carriers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('carriers')
export class CarrierController {
  constructor(private readonly svc: CarrierService) {}

  @Post()
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Tạo đơn vị vận chuyển — [MANAGER, ADMIN]' })
  @ApiCreatedResponse({ type: CarrierResponseDto })
  async create(
    @Body() dto: CreateCarrierDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<CarrierResponseDto> {
    const doc = await this.svc.create(dto, actorId);
    return plainToInstance(CarrierResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật đơn vị vận chuyển — [MANAGER, ADMIN]' })
  @ApiOkResponse({ type: CarrierResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCarrierDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<CarrierResponseDto> {
    const doc = await this.svc.update(id, dto, actorId);
    return plainToInstance(CarrierResponseDto, doc.toObject(), TO_OPTS);
  }

  @Get()
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách đơn vị vận chuyển legacy — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: [CarrierResponseDto] })
  async list(@Query() query: QueryCarrierDto): Promise<{
    data: CarrierResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { data, total } = await this.svc.list(query);
    return {
      data: plainToInstance(
        CarrierResponseDto,
        data.map((d) => d.toObject()),
        TO_OPTS,
      ),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  @Get(':id')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết đơn vị vận chuyển legacy — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: CarrierResponseDto })
  async getById(@Param('id') id: string): Promise<CarrierResponseDto> {
    const doc = await this.svc.getById(id);
    return plainToInstance(CarrierResponseDto, doc.toObject(), TO_OPTS);
  }
}
