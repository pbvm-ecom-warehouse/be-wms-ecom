import {
  GoodsReceiptNoteStatus,
  GoodsReceiptNoteSchema,
} from './goods-receipt-note.schema';

describe('GoodsReceiptNote schema', () => {
  it('GoodsReceiptNoteStatus enum có đủ 3 giá trị', () => {
    expect(Object.values(GoodsReceiptNoteStatus)).toEqual([
      'DRAFT',
      'CONFIRMED',
      'APPROVED',
    ]);
  });

  it('schema có đủ field cần thiết', () => {
    const paths = GoodsReceiptNoteSchema.paths;
    expect(paths['grnNumber']).toBeDefined();
    expect(paths['purchaseOrderId']).toBeDefined();
    expect(paths['warehouseId']).toBeDefined();
    expect(paths['status']).toBeDefined();
    expect(paths['items']).toBeDefined();
    expect(paths['createdBy']).toBeDefined();
    expect(paths['confirmedBy']).toBeDefined();
    expect(paths['approvedBy']).toBeDefined();
    expect(paths['images']).toBeDefined();
  });

  it('field grnNumber có unique index', () => {
    const grnNumberSchema = GoodsReceiptNoteSchema.path('grnNumber') as {
      options?: { unique?: boolean };
    };
    expect(grnNumberSchema.options?.unique).toBe(true);
  });

  it('status mặc định DRAFT', () => {
    const statusSchema = GoodsReceiptNoteSchema.path('status') as {
      options?: { default?: GoodsReceiptNoteStatus };
    };
    expect(statusSchema.options?.default).toBe(GoodsReceiptNoteStatus.DRAFT);
  });

  it('GoodsReceiptNoteItem có field lotNumber/expiryDate optional', () => {
    const itemPaths = GoodsReceiptNoteSchema.path('items') as unknown as {
      schema: { paths: Record<string, unknown> };
    };
    expect(itemPaths.schema.paths['lotNumber']).toBeDefined();
    expect(itemPaths.schema.paths['expiryDate']).toBeDefined();
  });
});
