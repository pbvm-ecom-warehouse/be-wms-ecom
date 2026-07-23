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
import { AttributeOptionService } from './attribute-option.service';
import {
  AttributeOptionResponseDto,
  CodeSuggestionDto,
  CodeSuggestionResponseDto,
  CreateAttributeOptionDto,
  QueryAttributeOptionDto,
  UpdateAttributeOptionDto,
} from './dto/attribute-option.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('stock-attribute-options')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock/attribute-options')
export class AttributeOptionController {
  constructor(private readonly svc: AttributeOptionService) {}

  @Get()
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary: 'Danh sách option thuộc tính theo key — [ADMIN, MANAGER]',
  })
  @ApiOkResponse({ type: [AttributeOptionResponseDto] })
  async list(@Query() query: QueryAttributeOptionDto) {
    const list = await this.svc.list(query.key, query.includeInactive ?? false);
    return plainToInstance(AttributeOptionResponseDto, list, TO_OPTS);
  }

  @Post('code-suggestion')
  @Roles(WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Gợi ý code từ name — ADMIN xác nhận trước khi lưu — [ADMIN]',
  })
  @ApiOkResponse({ type: CodeSuggestionResponseDto })
  suggestCode(@Body() dto: CodeSuggestionDto) {
    const result = this.svc.suggestCode(dto.key, dto.name);
    return plainToInstance(CodeSuggestionResponseDto, result, TO_OPTS);
  }

  @Post()
  @Roles(WmsRole.ADMIN)
  @ApiOperation({ summary: 'Tạo option thuộc tính mới — [ADMIN]' })
  @ApiCreatedResponse({ type: AttributeOptionResponseDto })
  async create(
    @Body() dto: CreateAttributeOptionDto,
    @CurrentUser('sub') actorId: string,
  ) {
    const doc = await this.svc.create(dto, actorId);
    return plainToInstance(AttributeOptionResponseDto, doc.toObject(), TO_OPTS);
  }

  @Patch(':id')
  @Roles(WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Cập nhật option (name/isActive/sortOrder, không sửa code) — [ADMIN]',
  })
  @ApiOkResponse({ type: AttributeOptionResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAttributeOptionDto,
    @CurrentUser('sub') actorId: string,
  ) {
    const doc = await this.svc.update(id, dto, actorId);
    return plainToInstance(
      AttributeOptionResponseDto,
      doc?.toObject(),
      TO_OPTS,
    );
  }
}
