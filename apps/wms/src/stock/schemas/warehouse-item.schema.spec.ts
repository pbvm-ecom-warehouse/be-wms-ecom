import { ItemType, WarehouseItemSchema } from './warehouse-item.schema';

describe('WarehouseItem schema', () => {
  it('ItemType enum có đủ 4 giá trị', () => {
    expect(Object.values(ItemType)).toEqual([
      'MATERIAL',
      'CUP_BLANK',
      'CUP_PRINTED',
      'PACKAGING',
    ]);
  });

  it('schema có field sku, barcode, name, type, unit, isPerishable, isActive', () => {
    const paths = WarehouseItemSchema.paths;
    expect(paths['sku']).toBeDefined();
    expect(paths['barcode']).toBeDefined();
    expect(paths['name']).toBeDefined();
    expect(paths['type']).toBeDefined();
    expect(paths['unit']).toBeDefined();
    expect(paths['isPerishable']).toBeDefined();
    expect(paths['isActive']).toBeDefined();
    expect(paths['deletedAt']).toBeDefined();
    expect(paths['createdBy']).toBeDefined();
    expect(paths['updatedBy']).toBeDefined();
  });
});
