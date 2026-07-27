import { AisleSchema } from './aisle.schema';

describe('Aisle schema', () => {
  it('có đủ field code/type/toạ độ/kích thước', () => {
    const paths = AisleSchema.paths;
    expect(paths['code']).toBeDefined();
    expect(paths['type']).toBeDefined();
    expect(paths['xM']).toBeDefined();
    expect(paths['yM']).toBeDefined();
    expect(paths['widthM']).toBeDefined();
    expect(paths['heightM']).toBeDefined();
  });

  it('collection tên aisles', () => {
    expect(AisleSchema.get('collection')).toBe('aisles');
  });
});
