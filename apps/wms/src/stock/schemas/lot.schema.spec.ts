import { LotSchema, LotStatus } from './lot.schema';

describe('Lot schema', () => {
  it('LotStatus enum có ACTIVE và EXPIRED', () => {
    expect(Object.values(LotStatus)).toEqual(['ACTIVE', 'EXPIRED']);
  });

  it('schema có đủ field lô hàng', () => {
    const paths = LotSchema.paths;
    expect(paths['itemId']).toBeDefined();
    expect(paths['lotNumber']).toBeDefined();
    expect(paths['expiryDate']).toBeDefined();
    expect(paths['receivedDate']).toBeDefined();
    expect(paths['status']).toBeDefined();
    // audit: createdAt + updatedAt (chứng từ nhập lô — không soft-delete)
    expect(paths['createdAt']).toBeDefined();
    expect(paths['updatedAt']).toBeDefined();
  });
});
