import { InventoryStockSchema } from './inventory-stock.schema';

describe('InventoryStock schema', () => {
  it('schema có đủ field tồn theo vị trí', () => {
    const paths = InventoryStockSchema.paths;
    expect(paths['itemId']).toBeDefined();
    expect(paths['warehouseId']).toBeDefined();
    expect(paths['shelfId']).toBeDefined();
    expect(paths['lotId']).toBeDefined();
    expect(paths['quantity']).toBeDefined();
    // Snapshot — chỉ updatedAt, không createdAt
    expect(paths['updatedAt']).toBeDefined();
    expect(paths['createdAt']).toBeUndefined();
  });
});
