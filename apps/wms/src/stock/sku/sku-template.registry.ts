import { ItemType } from '../schemas/warehouse-item.schema';
import { AttributeOptionKey } from '../schemas/attribute-option.schema';

export interface SkuTemplateField {
  key: AttributeOptionKey;
}

/**
 * category=null cho CUP_BLANK (không phân nhóm con). category != null cho
 * MATERIAL/PACKAGING — mỗi nhóm (Trà, Sữa, Nắp ly...) là 1 template riêng,
 * chọn qua categoryOptionId (issue #25: "MATERIAL/PACKAGING lần đầu trả
 * category options; sau khi chọn category trả child template").
 */
export interface SkuTemplate {
  templateId: string;
  itemType: ItemType;
  category: string | null;
  prefix: string;
  fields: SkuTemplateField[];
}

const f = (key: AttributeOptionKey): SkuTemplateField => ({ key });

/**
 * 11 template đã chốt trong issue #25 — KHÔNG đọc từ DB, ADMIN không sửa cấu
 * trúc này qua UI (chỉ quản lý option VALUE qua AttributeOptionService).
 * Đổi template = sửa code + review, không phải thao tác vận hành.
 */
export const SKU_TEMPLATES: SkuTemplate[] = [
  {
    templateId: 'CUP_BLANK',
    itemType: ItemType.CUP_BLANK,
    category: null,
    prefix: 'CUP',
    fields: [
      f(AttributeOptionKey.CUP_STYLE),
      f(AttributeOptionKey.MATERIAL),
      f(AttributeOptionKey.CAPACITY),
      f(AttributeOptionKey.COLOR),
    ],
  },
  {
    templateId: 'MATERIAL_TEA',
    itemType: ItemType.MATERIAL,
    category: 'TEA',
    prefix: 'MAT-TEA',
    fields: [
      f(AttributeOptionKey.MATERIAL_TYPE),
      f(AttributeOptionKey.FLAVOR),
      f(AttributeOptionKey.SPEC),
    ],
  },
  {
    templateId: 'MATERIAL_MILK',
    itemType: ItemType.MATERIAL,
    category: 'MILK',
    prefix: 'MAT-MILK',
    fields: [f(AttributeOptionKey.MATERIAL_TYPE), f(AttributeOptionKey.SPEC)],
  },
  {
    templateId: 'MATERIAL_SUGAR',
    itemType: ItemType.MATERIAL,
    category: 'SUGAR',
    prefix: 'MAT-SUGAR',
    fields: [f(AttributeOptionKey.MATERIAL_TYPE), f(AttributeOptionKey.SPEC)],
  },
  {
    templateId: 'MATERIAL_TOPPING',
    itemType: ItemType.MATERIAL,
    category: 'TOPPING',
    prefix: 'MAT-TOP',
    fields: [
      f(AttributeOptionKey.MATERIAL_TYPE),
      f(AttributeOptionKey.FLAVOR),
      f(AttributeOptionKey.SPEC),
    ],
  },
  {
    templateId: 'MATERIAL_SYRUP',
    itemType: ItemType.MATERIAL,
    category: 'SYRUP',
    prefix: 'MAT-SYR',
    fields: [f(AttributeOptionKey.FLAVOR), f(AttributeOptionKey.SPEC)],
  },
  {
    templateId: 'MATERIAL_POWDER',
    itemType: ItemType.MATERIAL,
    category: 'POWDER',
    prefix: 'MAT-PWD',
    fields: [f(AttributeOptionKey.FLAVOR), f(AttributeOptionKey.SPEC)],
  },
  {
    templateId: 'PACKAGING_LID',
    itemType: ItemType.PACKAGING,
    category: 'LID',
    prefix: 'PKG-LID',
    fields: [
      f(AttributeOptionKey.PACKAGING_STYLE),
      f(AttributeOptionKey.COMPATIBILITY),
      f(AttributeOptionKey.COLOR),
    ],
  },
  {
    templateId: 'PACKAGING_STRAW',
    itemType: ItemType.PACKAGING,
    category: 'STRAW',
    prefix: 'PKG-STR',
    fields: [
      f(AttributeOptionKey.DIAMETER),
      f(AttributeOptionKey.LENGTH),
      f(AttributeOptionKey.COLOR),
    ],
  },
  {
    templateId: 'PACKAGING_BAG',
    itemType: ItemType.PACKAGING,
    category: 'BAG',
    prefix: 'PKG-BAG',
    fields: [
      f(AttributeOptionKey.MATERIAL),
      f(AttributeOptionKey.SIZE),
      f(AttributeOptionKey.COLOR),
    ],
  },
  {
    templateId: 'PACKAGING_BOX',
    itemType: ItemType.PACKAGING,
    category: 'BOX',
    prefix: 'PKG-BOX',
    fields: [
      f(AttributeOptionKey.MATERIAL),
      f(AttributeOptionKey.SIZE),
      f(AttributeOptionKey.COLOR),
    ],
  },
];

/** itemType nào cần chọn category trước (MATERIAL/PACKAGING) → key option đại diện category đó. */
export const CATEGORY_CODE_KEY: Partial<Record<ItemType, AttributeOptionKey>> =
  {
    [ItemType.MATERIAL]: AttributeOptionKey.MATERIAL_CATEGORY,
    [ItemType.PACKAGING]: AttributeOptionKey.PACKAGING_CATEGORY,
  };

export function findRootTemplates(itemType: ItemType): SkuTemplate[] {
  return SKU_TEMPLATES.filter((t) => t.itemType === itemType);
}

export function findTemplateById(templateId: string): SkuTemplate | undefined {
  return SKU_TEMPLATES.find((t) => t.templateId === templateId);
}
