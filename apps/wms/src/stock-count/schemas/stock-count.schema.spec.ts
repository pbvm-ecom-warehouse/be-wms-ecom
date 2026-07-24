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

  it('createdBy là required', () => {
    const createdByPath = StockCountSchema.paths['createdBy'] as unknown as {
      isRequired: boolean;
    };
    expect(createdByPath.isRequired).toBe(true);
  });

  it('zoneId mặc định null (kiểm toàn kho)', () => {
    const path = StockCountSchema.paths['zoneId'];
    expect(path.defaultValue).toBeNull();
  });

  it('items là required array', () => {
    expect(StockCountSchema.paths['items']).toBeDefined();
  });

  it('có index status', () => {
    const indexes = StockCountSchema.indexes();
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

  it('StockCountItem có field images (default [])', () => {
    const itemPaths = (
      StockCountSchema.path('items') as unknown as {
        schema: { paths: Record<string, { defaultValue: unknown }> };
      }
    ).schema.paths;
    const imagesPath = itemPaths['images'];
    expect(imagesPath).toBeDefined();
    const defaultValue =
      typeof imagesPath.defaultValue === 'function'
        ? (imagesPath.defaultValue as () => unknown)()
        : imagesPath.defaultValue;
    expect(defaultValue).toEqual([]);
  });
});
