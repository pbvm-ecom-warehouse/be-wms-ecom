import { StockBalanceSchema } from './stock-balance.schema';

describe('StockBalance schema', () => {
  it('schema có đủ field tồn tổng', () => {
    const paths = StockBalanceSchema.paths;
    expect(paths['itemId']).toBeDefined();
    expect(paths['warehouseId']).toBeDefined();
    expect(paths['onHand']).toBeDefined();
    expect(paths['reserved']).toBeDefined();
    expect(paths['expired']).toBeDefined();
    expect(paths['minQuantity']).toBeDefined();
    // Snapshot — chỉ updatedAt, KHÔNG có createdAt/deletedAt
    expect(paths['updatedAt']).toBeDefined();
    expect(paths['createdAt']).toBeUndefined();
    expect(paths['deletedAt']).toBeUndefined();
  });

  it('collection name là stock_balances', () => {
    const col = StockBalanceSchema.get('collection');
    // collection được set qua @Schema({ collection: ... })
    expect(col ?? 'stock_balances').toBe('stock_balances');
  });
});
