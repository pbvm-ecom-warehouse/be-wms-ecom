import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { AttributeOptionRepository } from '../attribute-option/attribute-option.repository';
import { AttributeOptionKey } from '../schemas/attribute-option.schema';
import { ItemType } from '../schemas/warehouse-item.schema';
import { buildSku } from './sku-builder';
import {
  CATEGORY_CODE_KEY,
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

export type SkuTemplateLookupResult =
  | { kind: 'template'; template: SkuTemplate }
  | {
      kind: 'category-options';
      categoryKey: AttributeOptionKey;
    };

@Injectable()
export class SkuTemplateService {
  constructor(private readonly optionRepo: AttributeOptionRepository) {}

  /**
   * CUP_BLANK không phân nhóm → trả template ngay. MATERIAL/PACKAGING cần
   * chọn category trước: không truyền categoryOptionId → FE phải tự GET
   * /attribute-options?key=<categoryKey> (client tự query, service chỉ báo
   * categoryKey cần dùng — tránh trộn 2 trách nhiệm khác nhau vào 1 response).
   */
  async getRootOrCategoryOptions(
    itemType: ItemType,
    categoryOptionId?: string,
  ): Promise<SkuTemplateLookupResult> {
    const categoryKey = CATEGORY_CODE_KEY[itemType];
    if (!categoryKey) {
      const [template] = findRootTemplates(itemType);
      if (!template) throw new AppException('STOCK_SKU_TEMPLATE_NOT_FOUND');
      return { kind: 'template', template };
    }

    if (!categoryOptionId) {
      return { kind: 'category-options', categoryKey };
    }

    const [option] = await this.optionRepo.findByIds([categoryOptionId]);
    if (!option) throw new AppException('STOCK_ATTRIBUTE_OPTION_NOT_FOUND');

    const template = findRootTemplates(itemType).find(
      (t) => t.category === option.code,
    );
    if (!template) throw new AppException('STOCK_SKU_TEMPLATE_NOT_FOUND');
    return { kind: 'template', template };
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
      if (!option) throw new AppException('STOCK_ATTRIBUTE_OPTION_NOT_FOUND');
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
