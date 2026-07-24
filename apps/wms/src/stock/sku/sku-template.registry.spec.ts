import { ItemType } from '../schemas/warehouse-item.schema';
import {
  SKU_TEMPLATES,
  findRootTemplates,
  findTemplateById,
  findValidCategoryCodes,
} from './sku-template.registry';
import { AttributeOptionKey } from '../schemas/attribute-option.schema';

describe('sku-template.registry', () => {
  it('khai đủ 3 template (CUP_BLANK, MATERIAL, PACKAGING)', () => {
    expect(SKU_TEMPLATES).toHaveLength(3);
    expect(
      SKU_TEMPLATES.filter((t) => t.itemType === ItemType.CUP_BLANK),
    ).toHaveLength(1);
    expect(
      SKU_TEMPLATES.filter((t) => t.itemType === ItemType.MATERIAL),
    ).toHaveLength(1);
    expect(
      SKU_TEMPLATES.filter((t) => t.itemType === ItemType.PACKAGING),
    ).toHaveLength(1);
  });

  it('CUP_BLANK trả đúng 1 template ngay', () => {
    const templates = findRootTemplates(ItemType.CUP_BLANK);
    expect(templates).toHaveLength(1);
    expect(templates[0].prefix).toBe('CUP');
    expect(templates[0].fields.map((f) => f.key)).toEqual([
      'CUP_STYLE',
      'MATERIAL',
      'CAPACITY',
      'COLOR',
    ]);
  });

  it('MATERIAL trả về 1 template gộp: CATEGORY, TYPE, FLAVOR(optional), SPEC', () => {
    const [template] = findRootTemplates(ItemType.MATERIAL);
    expect(template.templateId).toBe('MATERIAL');
    expect(template.prefix).toBe('MAT');
    expect(template.fields.map((f) => f.key)).toEqual([
      'MATERIAL_CATEGORY',
      'MATERIAL_TYPE',
      'FLAVOR',
      'SPEC',
    ]);
    expect(
      template.fields.find((f) => f.key === AttributeOptionKey.FLAVOR)
        ?.required,
    ).toBe(false);
    expect(
      template.fields.find((f) => f.key === AttributeOptionKey.SPEC)?.required,
    ).toBe(true);
  });

  it('PACKAGING trả về 1 template gộp: CATEGORY, SIZE(optional), COLOR(optional)', () => {
    const [template] = findRootTemplates(ItemType.PACKAGING);
    expect(template.templateId).toBe('PACKAGING');
    expect(template.prefix).toBe('PKG');
    expect(template.fields.map((f) => f.key)).toEqual([
      'PACKAGING_CATEGORY',
      'SIZE',
      'COLOR',
    ]);
    expect(
      template.fields.find((f) => f.key === AttributeOptionKey.SIZE)?.required,
    ).toBe(false);
    expect(
      template.fields.find((f) => f.key === AttributeOptionKey.COLOR)?.required,
    ).toBe(false);
  });

  it('findTemplateById trả undefined nếu không khớp', () => {
    expect(findTemplateById('NOPE')).toBeUndefined();
  });

  it('findValidCategoryCodes trả đúng danh sách category cho MATERIAL/PACKAGING', () => {
    expect(
      findValidCategoryCodes(AttributeOptionKey.MATERIAL_CATEGORY),
    ).toEqual(['TEA', 'MILK', 'SUGAR', 'TOPPING', 'SYRUP', 'POWDER']);
    expect(
      findValidCategoryCodes(AttributeOptionKey.PACKAGING_CATEGORY),
    ).toEqual(['LID', 'STRAW', 'BAG', 'BOX']);
  });

  it('findValidCategoryCodes trả mảng rỗng cho key không phải category', () => {
    expect(findValidCategoryCodes(AttributeOptionKey.SPEC)).toEqual([]);
  });
});
