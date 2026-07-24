import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, WmsRole } from '@app/auth';
import { plainToInstance } from 'class-transformer';
import { PutAwaySuggestionService } from './put-away-suggestion.service';
import {
  PutAwaySuggestionResponseDto,
  QueryPutAwaySuggestionDto,
} from './dto/put-away-suggestion.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

@ApiTags('put-away-suggestion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('putaway/suggestions')
export class PutAwaySuggestionController {
  constructor(private readonly svc: PutAwaySuggestionService) {}

  @Get()
  @Roles(WmsRole.RECEIVER, WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary:
      'Gợi ý vị trí put-away theo thể tích (advisory) — [RECEIVER, MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: PutAwaySuggestionResponseDto })
  async suggest(
    @Query() query: QueryPutAwaySuggestionDto,
  ): Promise<PutAwaySuggestionResponseDto> {
    const result = await this.svc.suggest(query.sku, query.qty);
    return plainToInstance(PutAwaySuggestionResponseDto, result, TO_OPTS);
  }
}
