import {
  PrintJob,
  PrintJobSchema,
  PrintJobStatus,
  PrintJobLineStatus,
} from './print-job.schema';

describe('PrintJobSchema', () => {
  it('default status là PENDING', () => {
    const paths = PrintJobSchema.paths;
    expect(paths['status'].defaultValue).toBe(PrintJobStatus.PENDING);
  });

  it('orderId là required + unique', () => {
    const path = PrintJobSchema.paths['orderId'] as unknown as {
      isRequired: boolean;
      options: { unique?: boolean };
    };
    expect(path.isRequired).toBe(true);
    expect(path.options.unique).toBe(true);
  });

  it('items là required array', () => {
    expect(PrintJobSchema.paths['items']).toBeDefined();
  });

  it('có index orderId unique và status', () => {
    const indexes = PrintJobSchema.indexes();
    const orderIdIndex = indexes.find(([def]) => def['orderId'] === 1);
    expect(orderIdIndex?.[1]).toMatchObject({ unique: true });
    const statusIndex = indexes.find(([def]) => def['status'] === 1);
    expect(statusIndex).toBeDefined();
  });

  it('PrintJobStatus có đủ 4 giá trị', () => {
    expect(Object.values(PrintJobStatus)).toEqual([
      'PENDING',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ]);
  });

  it('PrintJobLineStatus có đủ 3 giá trị', () => {
    expect(Object.values(PrintJobLineStatus)).toEqual([
      'PENDING',
      'CONSUMED',
      'COMPLETED',
    ]);
  });

  it('export PrintJob class dùng được với SchemaFactory (smoke test)', () => {
    expect(PrintJob).toBeDefined();
  });
});
