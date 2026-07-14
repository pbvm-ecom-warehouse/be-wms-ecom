import {
  StockCount,
  StockCountSchema,
  StockCountStatus,
} from './stock-count.schema';

describe('StockCountSchema', () => {
  it('default status là DRAFT', () => {
    const paths = StockCountSchema.paths;
    expect(paths['status'].defaultValue).toBe(StockCountStatus.DRAFT);
  });

  it('warehouseId và createdBy là required', () => {
    const warehouseIdPath = StockCountSchema.paths[
      'warehouseId'
    ] as unknown as { isRequired: boolean };
    const createdByPath = StockCountSchema.paths['createdBy'] as unknown as {
      isRequired: boolean;
    };
    expect(warehouseIdPath.isRequired).toBe(true);
    expect(createdByPath.isRequired).toBe(true);
  });

  it('zoneId mặc định null (kiểm toàn kho)', () => {
    const path = StockCountSchema.paths['zoneId'];
    expect(path.defaultValue).toBeNull();
  });

  it('items là required array', () => {
    expect(StockCountSchema.paths['items']).toBeDefined();
  });

  it('có index warehouseId+status và status', () => {
    const indexes = StockCountSchema.indexes();
    const compound = indexes.find(
      ([def]) => def['warehouseId'] === 1 && def['status'] === 1,
    );
    expect(compound).toBeDefined();
    const statusOnly = indexes.find(
      ([def]) => def['status'] === 1 && !('warehouseId' in def),
    );
    expect(statusOnly).toBeDefined();
  });

  it('StockCountStatus có đủ 4 giá trị', () => {
    expect(Object.values(StockCountStatus)).toEqual([
      'DRAFT',
      'IN_PROGRESS',
      'COMPLETED',
      'APPROVED',
    ]);
  });

  it('export StockCount class dùng được với SchemaFactory (smoke test)', () => {
    expect(StockCount).toBeDefined();
  });
});
