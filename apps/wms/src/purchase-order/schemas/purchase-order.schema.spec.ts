import {
  PurchaseOrderStatus,
  PurchaseOrderSchema,
} from './purchase-order.schema';

describe('PurchaseOrder schema', () => {
  it('PurchaseOrderStatus enum có đủ 6 giá trị', () => {
    expect(Object.values(PurchaseOrderStatus)).toEqual([
      'DRAFT',
      'CONFIRMED',
      'SENT',
      'PARTIALLY_RECEIVED',
      'COMPLETED',
      'CANCELLED',
    ]);
  });

  it('schema có đủ field cần thiết', () => {
    const paths = PurchaseOrderSchema.paths;
    expect(paths['poNumber']).toBeDefined();
    expect(paths['supplierId']).toBeDefined();
    expect(paths['warehouseId']).toBeDefined();
    expect(paths['status']).toBeDefined();
    expect(paths['items']).toBeDefined();
    expect(paths['createdBy']).toBeDefined();
  });

  it('field poNumber có unique index', () => {
    const poNumberSchema = PurchaseOrderSchema.path('poNumber') as {
      options?: { unique?: boolean };
    };
    expect(poNumberSchema.options?.unique).toBe(true);
  });

  it('status mặc định CONFIRMED', () => {
    const statusSchema = PurchaseOrderSchema.path('status') as {
      options?: { default?: PurchaseOrderStatus };
    };
    expect(statusSchema.options?.default).toBe(PurchaseOrderStatus.CONFIRMED);
  });

  it('PurchaseOrderItem có field receivedQty mặc định 0', () => {
    const itemPaths = PurchaseOrderSchema.path('items') as unknown as {
      schema: { paths: Record<string, { options?: { default?: number } }> };
    };
    const receivedQtyPath = itemPaths.schema.paths['receivedQty'];
    expect(receivedQtyPath).toBeDefined();
    expect(receivedQtyPath.options?.default).toBe(0);
  });
});
