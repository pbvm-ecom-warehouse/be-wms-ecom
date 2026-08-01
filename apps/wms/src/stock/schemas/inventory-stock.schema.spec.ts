import { InventoryStockSchema } from './inventory-stock.schema';

describe('InventoryStock schema', () => {
  it('schema có đủ field tồn theo vị trí', () => {
    const paths = InventoryStockSchema.paths;
    expect(paths['itemId']).toBeDefined();
    expect(paths['shelfId']).toBeDefined();
    expect(paths['lotId']).toBeDefined();
    expect(paths['quantity']).toBeDefined();
    expect(paths['isQuarantined']).toBeDefined();
    expect(paths['quarantinedQuantity']).toBeDefined();
    // Snapshot — chỉ updatedAt, không createdAt
    expect(paths['updatedAt']).toBeDefined();
    expect(paths['createdAt']).toBeUndefined();
  });

  it('dòng tồn mặc định chưa bị cách ly', () => {
    expect(InventoryStockSchema.path('isQuarantined').options.default).toBe(
      false,
    );
    expect(
      InventoryStockSchema.path('quarantinedQuantity').options.default,
    ).toBe(0);
  });
});
