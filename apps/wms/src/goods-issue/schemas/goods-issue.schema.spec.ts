import {
  GoodsIssue,
  GoodsIssueSchema,
  GoodsIssueStatus,
} from './goods-issue.schema';

describe('GoodsIssueSchema', () => {
  it('default status là PENDING', () => {
    const paths = GoodsIssueSchema.paths;
    expect(paths['status'].defaultValue).toBe(GoodsIssueStatus.PENDING);
  });

  it('orderId là required + unique', () => {
    const path = GoodsIssueSchema.paths['orderId'] as unknown as {
      isRequired: boolean;
      options: { unique?: boolean };
    };
    expect(path.isRequired).toBe(true);
    expect(path.options.unique).toBe(true);
  });

  it('items là required array', () => {
    expect(GoodsIssueSchema.paths['items']).toBeDefined();
  });

  it('có index orderId unique và status', () => {
    const indexes = GoodsIssueSchema.indexes();
    const orderIdIndex = indexes.find(([def]) => def['orderId'] === 1);
    expect(orderIdIndex?.[1]).toMatchObject({ unique: true });
    const statusIndex = indexes.find(([def]) => def['status'] === 1);
    expect(statusIndex).toBeDefined();
  });

  it('có mã phiếu unique sparse và orderCode snapshot nullable cho dữ liệu cũ', () => {
    const paths = GoodsIssueSchema.paths;
    expect(paths['goodsIssueNumber']).toBeDefined();
    expect(paths['orderCode']).toBeDefined();
    const numberIndex = GoodsIssueSchema.indexes().find(
      ([def]) => def['goodsIssueNumber'] === 1,
    );
    expect(numberIndex?.[1]).toMatchObject({ unique: true, sparse: true });
  });

  it('export GoodsIssue class dùng được với SchemaFactory (smoke test)', () => {
    expect(GoodsIssue).toBeDefined();
  });

  it('có field snapshot recipient/paymentMethod/codAmount/shippingAddress', () => {
    const paths = GoodsIssueSchema.paths;
    expect(paths['recipient']).toBeDefined();
    expect(paths['paymentMethod']).toBeDefined();
    expect(paths['codAmount']).toBeDefined();
    expect(paths['shippingAddress']).toBeDefined();
  });
});
