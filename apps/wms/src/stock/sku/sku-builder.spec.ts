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

  it('sinh đúng MAT-SYR-PEACH-750ML theo ví dụ trong issue #25', () => {
    const template = findTemplateById('MATERIAL_SYRUP')!;
    const sku = buildSku(template, { FLAVOR: 'PEACH', SPEC: '750ML' });
    expect(sku).toBe('MAT-SYR-PEACH-750ML');
  });

  it('sinh đúng PKG-STR-12MM-230MM-BLK theo ví dụ trong issue #25', () => {
    const template = findTemplateById('PACKAGING_STRAW')!;
    const sku = buildSku(template, {
      DIAMETER: '12MM',
      LENGTH: '230MM',
      COLOR: 'BLK',
    });
    expect(sku).toBe('PKG-STR-12MM-230MM-BLK');
  });

  it('luôn theo đúng order của template, bất kể order key trong object truyền vào', () => {
    const template = findTemplateById('MATERIAL_SYRUP')!;
    const sku = buildSku(template, { SPEC: '750ML', FLAVOR: 'PEACH' });
    expect(sku).toBe('MAT-SYR-PEACH-750ML');
  });

  it('throw nếu thiếu code cho 1 field bắt buộc', () => {
    const template = findTemplateById('MATERIAL_SYRUP')!;
    expect(() => buildSku(template, { FLAVOR: 'PEACH' })).toThrow();
  });
});
