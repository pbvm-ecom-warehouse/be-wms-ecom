import { ItemType } from '../schemas/warehouse-item.schema';
import {
  SKU_TEMPLATES,
  findRootTemplates,
  findTemplateById,
} from './sku-template.registry';

describe('sku-template.registry', () => {
  it('khai đủ 11 template (1 CUP_BLANK + 6 MATERIAL + 4 PACKAGING)', () => {
    expect(SKU_TEMPLATES).toHaveLength(11);
    expect(
      SKU_TEMPLATES.filter((t) => t.itemType === ItemType.CUP_BLANK),
    ).toHaveLength(1);
    expect(
      SKU_TEMPLATES.filter((t) => t.itemType === ItemType.MATERIAL),
    ).toHaveLength(6);
    expect(
      SKU_TEMPLATES.filter((t) => t.itemType === ItemType.PACKAGING),
    ).toHaveLength(4);
  });

  it('CUP_BLANK trả đúng 1 template ngay (không cần category)', () => {
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

  it('MATERIAL trả về 6 template con (mỗi nhóm 1 template)', () => {
    const templates = findRootTemplates(ItemType.MATERIAL);
    expect(templates).toHaveLength(6);
  });

  it('template Syrup đúng field order theo issue: FLAVOR, SPEC (không có MATERIAL_TYPE)', () => {
    const syrup = SKU_TEMPLATES.find((t) => t.templateId === 'MATERIAL_SYRUP');
    expect(syrup?.prefix).toBe('MAT-SYR');
    expect(syrup?.fields.map((f) => f.key)).toEqual(['FLAVOR', 'SPEC']);
  });

  it('findTemplateById trả undefined nếu không khớp', () => {
    expect(findTemplateById('NOPE')).toBeUndefined();
  });
});
