import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  WmsRole,
} from '@app/auth';
import { InventoryReconciliationService } from './inventory-reconciliation.service';
import { AssignInventoryCellDto } from './dto/inventory-reconciliation.dto';

@ApiTags('inventory-reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory-reconciliation')
export class InventoryReconciliationController {
  constructor(private readonly service: InventoryReconciliationService) {}

  @Get('unassigned')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER, WmsRole.RECEIVER)
  @ApiOperation({ summary: 'Danh sách tồn cũ chưa phân khoang' })
  listUnassigned() {
    return this.service.listUnassigned();
  }

  @Get('progress')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER, WmsRole.RECEIVER)
  @ApiOperation({ summary: 'Tiến độ phân khoang tồn cũ' })
  getProgress() {
    return this.service.getProgress();
  }

  @Post('assign')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER, WmsRole.RECEIVER)
  @ApiOperation({ summary: 'Quét khoang và phân vị trí cho tồn cũ' })
  assign(
    @Body() dto: AssignInventoryCellDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.assign(dto, actorId);
  }
}
