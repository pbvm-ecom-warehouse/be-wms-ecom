import { SupplierStatus, SupplierSchema } from './supplier.schema';

describe('Supplier schema', () => {
  it('SupplierStatus enum có đủ 3 giá trị', () => {
    expect(Object.values(SupplierStatus)).toEqual([
      'ACTIVE',
      'INACTIVE',
      'BLACKLIST',
    ]);
  });

  it('schema có đủ field cần thiết', () => {
    const paths = SupplierSchema.paths;
    expect(paths['code']).toBeDefined();
    expect(paths['name']).toBeDefined();
    expect(paths['status']).toBeDefined();
    expect(paths['deletedAt']).toBeDefined();
    expect(paths['createdBy']).toBeDefined();
    expect(paths['updatedBy']).toBeDefined();
  });

  it('field code có unique index', () => {
    const codeSchema = SupplierSchema.path('code') as { options?: { unique?: boolean } };
    expect(codeSchema.options?.unique).toBe(true);
  });
});
