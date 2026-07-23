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

  it('itemId KHÔNG unique riêng lẻ (1 SKU có thể có nhiều NCC báo giá)', () => {
    const itemIdPath = SupplierItemSchema.path('itemId') as {
      options?: { unique?: boolean };
    };
    expect(itemIdPath.options?.unique).toBeFalsy();
  });

  it('có compound unique index {itemId, supplierId} — 1 cặp SKU+NCC chỉ 1 báo giá', () => {
    const indexes = SupplierItemSchema.indexes();
    const compoundIndex = indexes.find(
      ([fields]) =>
        fields['itemId'] === 1 &&
        fields['supplierId'] === 1 &&
        Object.keys(fields).length === 2,
    );
    expect(compoundIndex).toBeDefined();
    const [, options] = compoundIndex!;
    expect(options.unique).toBe(true);
  });
});
