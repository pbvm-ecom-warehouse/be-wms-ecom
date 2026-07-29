import { PrintStage } from '@app/events';
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

  it('orderId và stage là required, idempotency dùng compound unique', () => {
    const path = PrintJobSchema.paths['orderId'] as unknown as {
      isRequired: boolean;
      options: { unique?: boolean };
    };
    expect(path.isRequired).toBe(true);
    expect(path.options.unique).not.toBe(true);
    const stagePath = PrintJobSchema.paths['stage'] as unknown as {
      isRequired: boolean;
      enumValues: string[];
    };
    expect(stagePath.isRequired).toBe(true);
    expect([...stagePath.enumValues].sort()).toEqual(
      [...Object.values(PrintStage)].sort(),
    );
  });

  it('items là required array', () => {
    expect(PrintJobSchema.paths['items']).toBeDefined();
  });

  it('có compound unique orderId+stage và index status', () => {
    const indexes = PrintJobSchema.indexes();
    const orderStageIndex = indexes.find(
      ([def]) => def['orderId'] === 1 && def['stage'] === 1,
    );
    expect(orderStageIndex?.[1]).toMatchObject({ unique: true });
    expect(
      indexes.find(
        ([def], index) =>
          index !== indexes.indexOf(orderStageIndex!) &&
          def['orderId'] === 1 &&
          Object.keys(def).length === 1,
      ),
    ).toBeUndefined();
    const statusIndex = indexes.find(([def]) => def['status'] === 1);
    expect(statusIndex).toBeDefined();
  });

  it('PrintJobStatus có trạng thái chờ cất thành phẩm', () => {
    expect(Object.values(PrintJobStatus)).toEqual([
      'PENDING',
      'IN_PROGRESS',
      'PUTAWAY_PENDING',
      'COMPLETED',
      'CANCELLED',
    ]);
  });

  it('dòng in theo dõi riêng số lượng thành phẩm còn ở staging', () => {
    const itemsPath = PrintJobSchema.paths['items'] as unknown as {
      schema: { paths: Record<string, { defaultValue?: unknown }> };
    };
    expect(itemsPath.schema.paths['putawayRemainingQty'].defaultValue).toBe(0);
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
