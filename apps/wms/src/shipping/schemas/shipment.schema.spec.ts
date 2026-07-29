import { ShipmentSchema, ShipmentStatus } from './shipment.schema';

describe('ShipmentSchema', () => {
  it('có index unique trên goodsIssueId (1 GoodsIssue = 1 Shipment)', () => {
    const indexes = ShipmentSchema.indexes();
    const hasUnique = indexes.some(
      ([fields, opts]) => fields['goodsIssueId'] === 1 && opts?.unique === true,
    );
    expect(hasUnique).toBe(true);
  });

  it('shipmentStatus mặc định PENDING', () => {
    const path = ShipmentSchema.path('shipmentStatus');
    expect(path.defaultValue).toBe(ShipmentStatus.PENDING);
  });

  it('attempts mặc định 0', () => {
    const path = ShipmentSchema.path('attempts');
    expect(path.defaultValue).toBe(0);
  });

  it('collection name là shipments', () => {
    expect(ShipmentSchema.get('collection')).toBe('shipments');
  });

  it('ShipmentStatusHistoryEntry có field images (default [])', () => {
    const historyPaths = (
      ShipmentSchema.path('statusHistory') as unknown as {
        schema: { paths: Record<string, { defaultValue: unknown }> };
      }
    ).schema.paths;
    const imagesPath = historyPaths['images'];
    expect(imagesPath).toBeDefined();
    const defaultValue =
      typeof imagesPath.defaultValue === 'function'
        ? (imagesPath.defaultValue as () => unknown)()
        : imagesPath.defaultValue;
    expect(defaultValue).toEqual([]);
  });

  it('package barcode có unique multikey index', () => {
    const indexes = ShipmentSchema.indexes();
    expect(
      indexes.some(
        ([fields, opts]) =>
          fields['packages.barcode'] === 1 && opts?.unique === true,
      ),
    ).toBe(true);
  });
});
