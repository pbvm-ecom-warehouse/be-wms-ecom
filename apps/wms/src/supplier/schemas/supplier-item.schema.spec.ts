import { SupplierItemSchema } from './supplier-item.schema';

describe('SupplierItem schema', () => {
  it('schema có đủ field cần thiết', () => {
    const paths = SupplierItemSchema.paths;
    expect(paths['itemId']).toBeDefined();
    expect(paths['supplierId']).toBeDefined();
    expect(paths['purchasePrice']).toBeDefined();
    expect(paths['leadTimeDays']).toBeDefined();
    expect(paths['minOrderQty']).toBeDefined();
    expect(paths['isActive']).toBeDefined();
  });

  it('itemId có unique index (1 SKU ↔ 1 NCC chính)', () => {
    const itemIdPath = SupplierItemSchema.path('itemId') as {
      options?: { unique?: boolean };
    };
    expect(itemIdPath.options?.unique).toBe(true);
  });
});
