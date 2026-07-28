import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common/errors/app.exception';
import { AttributeOptionRepository } from '../attribute-option/attribute-option.repository';
import { AttributeOptionKey } from '../schemas/attribute-option.schema';
import { ItemType } from '../schemas/warehouse-item.schema';
import { buildSku } from './sku-builder';
import {
  SkuTemplate,
  findRootTemplates,
  findTemplateById,
} from './sku-template.registry';

export interface AttributeSnapshotEntry {
  key: AttributeOptionKey;
  optionId: string;
  name: string;
  value: string;
  code: string;
}

@Injectable()
export class SkuTemplateService {
  constructor(private readonly optionRepo: AttributeOptionRepository) {}

  /**
   * Từ issue #35: MATERIAL/PACKAGING gộp về 1 template chung mỗi loại nên
   * không còn cần chọn category trước — luôn trả thẳng template duy nhất
   * của itemType.
   */
  getTemplate(itemType: ItemType): SkuTemplate {
    const [template] = findRootTemplates(itemType);
    if (!template) throw new AppException('STOCK_SKU_TEMPLATE_NOT_FOUND');
    return template;
  }

  /**
   * Nguồn sự thật duy nhất để sinh SKU cuối — BE KHÔNG tin sku/preview từ FE
   * (issue #25: "BE resolve lại template/type/category, load option và trả
   * SKU/barcode cuối cùng"). Luôn load lại option từ DB (không nhận code sẵn
   * từ client) để chặn option đã bị deactivate/đổi giữa lúc preview và lúc submit.
   */
  async resolveAndBuildSku(
    templateId: string,
    itemType: ItemType,
    attributeOptionIds: string[],
  ): Promise<{ sku: string; attributeSnapshot: AttributeSnapshotEntry[] }> {
    const template = findTemplateById(templateId);
    if (!template) throw new AppException('STOCK_SKU_TEMPLATE_NOT_FOUND');
    if (template.itemType !== itemType) {
      throw new AppException('STOCK_SKU_TEMPLATE_MISMATCH');
    }

    const options = await this.optionRepo.findByIds(attributeOptionIds);
    const byKey = new Map(options.map((o) => [o.key, o]));

    const codesByKey: Record<string, string> = {};
    const attributeSnapshot: AttributeSnapshotEntry[] = [];

    for (const field of template.fields) {
      const option = byKey.get(field.key);
      if (!option) {
        // Field optional không có option đi kèm → bỏ qua segment này, không
        // đẩy vào snapshot (issue #35: FLAVOR/SIZE/COLOR có thể để trống).
        if (field.required === false) continue;
        throw new AppException('STOCK_ATTRIBUTE_OPTION_NOT_FOUND');
      }
      if (!option.isActive) {
        throw new AppException('STOCK_ATTRIBUTE_OPTION_INACTIVE');
      }
      codesByKey[field.key] = option.code;
      attributeSnapshot.push({
        key: field.key,
        optionId: option._id.toString(),
        name: option.name,
        value: option.name,
        code: option.code,
      });
    }

    const sku = buildSku(template, codesByKey);
    return { sku, attributeSnapshot };
  }
}
