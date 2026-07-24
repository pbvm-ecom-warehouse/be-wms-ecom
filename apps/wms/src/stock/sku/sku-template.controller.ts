import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, WmsRole } from '@app/auth';
import { plainToInstance } from 'class-transformer';
import { SkuTemplateService } from './sku-template.service';
import { ItemType } from '../schemas/warehouse-item.schema';
import { SkuTemplateResponseDto } from '../dto/sku-template.response.dto';
import { SkuPreviewDto, SkuPreviewResponseDto } from '../dto/sku-preview.dto';

const TO_OPTS = { excludeExtraneousValues: true } as const;

type PublicItemType =
  | ItemType.CUP_BLANK
  | ItemType.MATERIAL
  | ItemType.PACKAGING;

@ApiTags('stock-sku-template')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock')
export class SkuTemplateController {
  constructor(private readonly skuTemplateSvc: SkuTemplateService) {}

  @Get('item-types/:type/sku-template')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary: 'Lấy template SKU duy nhất của item type — [ADMIN, MANAGER]',
  })
  @ApiParam({
    name: 'type',
    enum: [ItemType.CUP_BLANK, ItemType.MATERIAL, ItemType.PACKAGING],
  })
  @ApiOkResponse({ type: SkuTemplateResponseDto })
  getSkuTemplate(@Param('type') type: PublicItemType) {
    const template = this.skuTemplateSvc.getTemplate(type);
    return plainToInstance(
      SkuTemplateResponseDto,
      {
        kind: 'template',
        templateId: template.templateId,
        itemType: template.itemType,
        category: template.category,
        prefix: template.prefix,
        fields: template.fields.map((field) => ({
          key: field.key,
          required: field.required ?? true,
        })),
      },
      TO_OPTS,
    );
  }

  @Post('items/sku-preview')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary:
      'Xem trước SKU (không tạo item, không cấp barcode) — [ADMIN, MANAGER]',
  })
  @ApiOkResponse({ type: SkuPreviewResponseDto })
  async previewSku(@Body() dto: SkuPreviewDto) {
    const { sku } = await this.skuTemplateSvc.resolveAndBuildSku(
      dto.templateId,
      dto.type,
      dto.attributeOptionIds,
    );
    return plainToInstance(SkuPreviewResponseDto, { sku }, TO_OPTS);
  }
}
