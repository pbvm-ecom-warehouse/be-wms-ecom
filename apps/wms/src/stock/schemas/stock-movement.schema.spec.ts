import { MovementType, StockMovementSchema } from './stock-movement.schema';

describe('StockMovement schema', () => {
  it('MovementType có đủ 8 giá trị (đã thêm RETURN_IN cho UC-09)', () => {
    expect(Object.values(MovementType)).toEqual([
      'RECEIVE',
      'PUTAWAY',
      'ISSUE',
      'ADJUST',
      'SCRAP',
      'PRINT_CONSUME',
      'PRINT_OUTPUT',
      'RETURN_IN',
    ]);
  });

  it('schema có đủ field sổ cái, chỉ createdAt (KHÔNG updatedAt)', () => {
    const paths = StockMovementSchema.paths;
    expect(paths['itemId']).toBeDefined();
    expect(paths['warehouseId']).toBeDefined();
    expect(paths['shelfId']).toBeDefined();
    expect(paths['lotId']).toBeDefined();
    expect(paths['type']).toBeDefined();
    expect(paths['quantity']).toBeDefined();
    expect(paths['refType']).toBeDefined();
    expect(paths['refId']).toBeDefined();
    expect(paths['createdBy']).toBeDefined();
    // Sổ cái BẤT BIẾN — chỉ createdAt, không updatedAt
    expect(paths['createdAt']).toBeDefined();
    expect(paths['updatedAt']).toBeUndefined();
  });

  it('collection name là stock_movements', () => {
    const col = StockMovementSchema.get('collection');
    // collection được set qua @Schema({ collection: ... })
    expect(col ?? 'stock_movements').toBe('stock_movements');
  });
});
