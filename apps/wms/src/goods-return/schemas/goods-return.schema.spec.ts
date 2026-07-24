import {
  GoodsReturn,
  GoodsReturnItemCondition,
  GoodsReturnSchema,
  GoodsReturnStatus,
} from './goods-return.schema';

describe('GoodsReturnSchema', () => {
  it('default status là DRAFT', () => {
    const paths = GoodsReturnSchema.paths;
    expect(paths['status'].defaultValue).toBe(GoodsReturnStatus.DRAFT);
  });

  it('createdBy mặc định null (không required)', () => {
    const createdByPath = GoodsReturnSchema.paths['createdBy'] as unknown as {
      isRequired: boolean;
      defaultValue: unknown;
    };
    expect(createdByPath.isRequired).toBeFalsy();
    expect(createdByPath.defaultValue).toBeNull();
  });

  it('items là required array', () => {
    expect(GoodsReturnSchema.paths['items']).toBeDefined();
  });

  it('GoodsReturnItem có field images (default [])', () => {
    const itemPaths = GoodsReturnSchema.path('items') as unknown as {
      schema: {
        paths: Record<string, { defaultValue: unknown }>;
      };
    };
    const imagesPath = itemPaths.schema.paths['images'];
    expect(imagesPath).toBeDefined();
    const defaultValue =
      typeof imagesPath.defaultValue === 'function'
        ? (imagesPath.defaultValue as () => unknown)()
        : imagesPath.defaultValue;
    expect(defaultValue).toEqual([]);
  });

  it('có index orderId, status', () => {
    const indexes = GoodsReturnSchema.indexes();
    expect(indexes.some(([def]) => def['orderId'] === 1)).toBe(true);
    expect(
      indexes.some(([def]) => def['status'] === 1 && !('warehouseId' in def)),
    ).toBe(true);
  });

  it('GoodsReturnStatus có đủ 4 giá trị', () => {
    expect(Object.values(GoodsReturnStatus)).toEqual([
      'DRAFT',
      'INSPECTED',
      'RESTOCKED',
      'CANCELLED',
    ]);
  });

  it('GoodsReturnItemCondition có đủ 2 giá trị', () => {
    expect(Object.values(GoodsReturnItemCondition)).toEqual([
      'GOOD',
      'DAMAGED',
    ]);
  });

  it('export GoodsReturn class dùng được với SchemaFactory (smoke test)', () => {
    expect(GoodsReturn).toBeDefined();
  });
});
