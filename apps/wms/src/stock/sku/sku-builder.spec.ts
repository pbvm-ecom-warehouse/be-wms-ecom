import { buildSku } from './sku-builder';
import { findTemplateById } from './sku-template.registry';

describe('buildSku', () => {
  it('sinh đúng CUP-HRT-PET-500-CLR theo ví dụ trong issue #25', () => {
    const template = findTemplateById('CUP_BLANK')!;
    const sku = buildSku(template, {
      CUP_STYLE: 'HRT',
      MATERIAL: 'PET',
      CAPACITY: '500',
      COLOR: 'CLR',
    });
    expect(sku).toBe('CUP-HRT-PET-500-CLR');
  });

  it('sinh đúng MAT-SYRUP-PEACH-750ML cho template MATERIAL gộp (có FLAVOR)', () => {
    const template = findTemplateById('MATERIAL')!;
    const sku = buildSku(template, {
      MATERIAL_CATEGORY: 'SYRUP',
      MATERIAL_TYPE: 'SYR',
      FLAVOR: 'PEACH',
      SPEC: '750ML',
    });
    expect(sku).toBe('MAT-SYRUP-SYR-PEACH-750ML');
  });

  it('bỏ qua segment FLAVOR nếu không gửi (field optional)', () => {
    const template = findTemplateById('MATERIAL')!;
    const sku = buildSku(template, {
      MATERIAL_CATEGORY: 'MILK',
      MATERIAL_TYPE: 'FRESH',
      SPEC: '1L',
    });
    expect(sku).toBe('MAT-MILK-FRESH-1L');
  });

  it('sinh đúng PKG-STRAW-12MM-BLK cho template PACKAGING gộp (có SIZE+COLOR)', () => {
    const template = findTemplateById('PACKAGING')!;
    const sku = buildSku(template, {
      PACKAGING_CATEGORY: 'STRAW',
      SIZE: '12MM',
      COLOR: 'BLK',
    });
    expect(sku).toBe('PKG-STRAW-12MM-BLK');
  });

  it('bỏ qua segment SIZE/COLOR nếu không gửi (field optional)', () => {
    const template = findTemplateById('PACKAGING')!;
    const sku = buildSku(template, { PACKAGING_CATEGORY: 'LID' });
    expect(sku).toBe('PKG-LID');
  });

  it('luôn theo đúng order của template, bất kể order key trong object truyền vào', () => {
    const template = findTemplateById('MATERIAL')!;
    const sku = buildSku(template, {
      SPEC: '750ML',
      FLAVOR: 'PEACH',
      MATERIAL_TYPE: 'SYR',
      MATERIAL_CATEGORY: 'SYRUP',
    });
    expect(sku).toBe('MAT-SYRUP-SYR-PEACH-750ML');
  });

  it('throw nếu thiếu code cho 1 field bắt buộc', () => {
    const template = findTemplateById('MATERIAL')!;
    expect(() =>
      buildSku(template, { MATERIAL_CATEGORY: 'SYRUP', FLAVOR: 'PEACH' }),
    ).toThrow();
  });
});
