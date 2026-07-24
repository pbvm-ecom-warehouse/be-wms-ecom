import { ItemType } from '../schemas/warehouse-item.schema';
import { AttributeOptionKey } from '../schemas/attribute-option.schema';

export interface SkuTemplateField {
  key: AttributeOptionKey;
  /** Mặc định true (bắt buộc) nếu không khai báo. false → field optional,
   * SKU builder bỏ qua segment này nếu client không gửi code. */
  required?: boolean;
}

/**
 * category=null cho mọi template hiện tại — MATERIAL/PACKAGING không còn phân
 * nhóm con theo category (issue #35: gộp về 1 template chung mỗi loại,
 * category giờ chỉ là 1 field bình thường trong template, không quyết định
 * chọn template nào).
 */
export interface SkuTemplate {
  templateId: string;
  itemType: ItemType;
  category: string | null;
  prefix: string;
  fields: SkuTemplateField[];
}

const f = (key: AttributeOptionKey, required = true): SkuTemplateField => ({
  key,
  required,
});

/**
 * 3 template: CUP_BLANK (issue #25) + MATERIAL/PACKAGING gộp (issue #35) —
 * KHÔNG đọc từ DB, ADMIN không sửa cấu trúc này qua UI (chỉ quản lý option
 * VALUE qua AttributeOptionService). Đổi template = sửa code + review, không
 * phải thao tác vận hành.
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
    templateId: 'MATERIAL',
    itemType: ItemType.MATERIAL,
    category: null,
    prefix: 'MAT',
    fields: [
      f(AttributeOptionKey.MATERIAL_CATEGORY),
      f(AttributeOptionKey.MATERIAL_TYPE),
      f(AttributeOptionKey.FLAVOR, false),
      f(AttributeOptionKey.SPEC),
    ],
  },
  {
    templateId: 'PACKAGING',
    itemType: ItemType.PACKAGING,
    category: null,
    prefix: 'PKG',
    fields: [
      f(AttributeOptionKey.PACKAGING_CATEGORY),
      f(AttributeOptionKey.SIZE, false),
      f(AttributeOptionKey.COLOR, false),
    ],
  },
];

/** Category code hợp lệ dùng để validate lúc ADMIN tạo attribute-option cho
 * MATERIAL_CATEGORY/PACKAGING_CATEGORY (xem AttributeOptionService.create).
 * Trước đây (issue #25) danh sách này suy ra từ nhiều template con; sau khi
 * gộp về 1 template/itemType (issue #35), category không còn phân biệt
 * template nữa nên phải khai trực tiếp thành hằng số riêng. */
export const MATERIAL_CATEGORY_CODES = [
  'TEA',
  'MILK',
  'SUGAR',
  'TOPPING',
  'SYRUP',
  'POWDER',
];

export const PACKAGING_CATEGORY_CODES = ['LID', 'STRAW', 'BAG', 'BOX'];

const CATEGORY_CODES_BY_KEY: Partial<Record<AttributeOptionKey, string[]>> = {
  [AttributeOptionKey.MATERIAL_CATEGORY]: MATERIAL_CATEGORY_CODES,
  [AttributeOptionKey.PACKAGING_CATEGORY]: PACKAGING_CATEGORY_CODES,
};

export function findRootTemplates(itemType: ItemType): SkuTemplate[] {
  return SKU_TEMPLATES.filter((t) => t.itemType === itemType);
}

export function findTemplateById(templateId: string): SkuTemplate | undefined {
  return SKU_TEMPLATES.find((t) => t.templateId === templateId);
}

/**
 * Tập code hợp lệ cho 1 category key (MATERIAL_CATEGORY/PACKAGING_CATEGORY) —
 * dùng để validate lúc ADMIN tạo attribute-option, tránh tạo option "mồ côi"
 * không khớp category nào (xem AttributeOptionService.create).
 */
export function findValidCategoryCodes(key: AttributeOptionKey): string[] {
  return CATEGORY_CODES_BY_KEY[key] ?? [];
}
