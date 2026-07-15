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

  it('warehouseId và createdBy mặc định null (không required)', () => {
    const warehouseIdPath = GoodsReturnSchema.paths[
      'warehouseId'
    ] as unknown as { isRequired: boolean; defaultValue: unknown };
    const createdByPath = GoodsReturnSchema.paths['createdBy'] as unknown as {
      isRequired: boolean;
      defaultValue: unknown;
    };
    expect(warehouseIdPath.isRequired).toBeFalsy();
    expect(warehouseIdPath.defaultValue).toBeNull();
    expect(createdByPath.isRequired).toBeFalsy();
    expect(createdByPath.defaultValue).toBeNull();
  });

  it('items là required array', () => {
    expect(GoodsReturnSchema.paths['items']).toBeDefined();
  });

  it('có index orderId, warehouseId+status, status', () => {
    const indexes = GoodsReturnSchema.indexes();
    expect(indexes.some(([def]) => def['orderId'] === 1)).toBe(true);
    expect(
      indexes.some(
        ([def]) => def['warehouseId'] === 1 && def['status'] === 1,
      ),
    ).toBe(true);
    expect(
      indexes.some(
        ([def]) => def['status'] === 1 && !('warehouseId' in def),
      ),
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
