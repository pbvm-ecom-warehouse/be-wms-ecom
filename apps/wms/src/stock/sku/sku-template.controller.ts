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
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard, WmsRole } from '@app/auth';
import { plainToInstance } from 'class-transformer';
import { SkuTemplateService } from './sku-template.service';
import { AttributeOptionService } from '../attribute-option/attribute-option.service';
import { ItemType } from '../schemas/warehouse-item.schema';
import {
  SkuCategoryOptionsResponseDto,
  SkuTemplateResponseDto,
} from '../dto/sku-template.response.dto';
import { SkuPreviewDto, SkuPreviewResponseDto } from '../dto/sku-preview.dto';
import { AttributeOptionResponseDto } from '../attribute-option/dto/attribute-option.dto';

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
  constructor(
    private readonly skuTemplateSvc: SkuTemplateService,
    private readonly optionSvc: AttributeOptionService,
  ) {}

  @Get('item-types/:type/sku-template')
  @Roles(WmsRole.ADMIN, WmsRole.MANAGER)
  @ApiOperation({
    summary:
      'Lấy template SKU (root hoặc category options nếu chưa chọn category) — [ADMIN, MANAGER]',
  })
  @ApiParam({
    name: 'type',
    enum: [ItemType.CUP_BLANK, ItemType.MATERIAL, ItemType.PACKAGING],
  })
  @ApiQuery({
    name: 'categoryOptionId',
    required: false,
    description:
      'Bỏ trống với CUP_BLANK (trả template ngay) hoặc lần đầu gọi cho MATERIAL/PACKAGING (trả category options để chọn trước)',
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/SkuTemplateResponseDto' },
        { $ref: '#/components/schemas/SkuCategoryOptionsResponseDto' },
      ],
    },
  })
  async getSkuTemplate(
    @Param('type') type: PublicItemType,
    @Query('categoryOptionId') categoryOptionId?: string,
  ) {
    const result = await this.skuTemplateSvc.getRootOrCategoryOptions(
      type,
      categoryOptionId,
    );

    if (result.kind === 'template') {
      return plainToInstance(
        SkuTemplateResponseDto,
        {
          kind: 'template',
          templateId: result.template.templateId,
          itemType: result.template.itemType,
          category: result.template.category,
          prefix: result.template.prefix,
          fields: result.template.fields,
        },
        TO_OPTS,
      );
    }

    const options = await this.optionSvc.list(result.categoryKey, false);
    return plainToInstance(
      SkuCategoryOptionsResponseDto,
      {
        kind: 'category-options',
        categoryKey: result.categoryKey,
        options: plainToInstance(AttributeOptionResponseDto, options, TO_OPTS),
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
