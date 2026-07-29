import { PrintStage } from '@app/events';
import { buildPrintJobStageMigrationPlan } from './print-job-stage-migration.plan';

describe('buildPrintJobStageMigrationPlan', () => {
  it('đổi orderId hậu tố sample về real orderId và backfill stage', () => {
    const plan = buildPrintJobStageMigrationPlan([
      {
        _id: 'sample-job',
        orderId: 'order-1-sample',
        isSample: true,
        items: [{ sku: 'CUP-PRINTED-1' }],
      },
      {
        _id: 'production-job',
        orderId: 'order-1',
        isSample: false,
        items: [{ orderItemId: 'line-1', sku: 'CUP-PRINTED-1' }],
      },
    ]);

    expect(plan.updates).toEqual([
      {
        id: 'sample-job',
        orderId: 'order-1',
        stage: PrintStage.SAMPLE,
      },
      {
        id: 'production-job',
        orderId: 'order-1',
        stage: PrintStage.PRODUCTION,
      },
    ]);
    expect(plan.missingOrderItemIds).toEqual(['sample-job']);
  });

  it('giữ nguyên canonical orderId kể cả tên thật kết thúc bằng -sample', () => {
    const plan = buildPrintJobStageMigrationPlan([
      {
        _id: 'canonical-job',
        orderId: 'real-order-sample',
        stage: PrintStage.SAMPLE,
        items: [{ orderItemId: 'line-1' }],
      },
    ]);

    expect(plan.updates[0]).toMatchObject({
      orderId: 'real-order-sample',
      stage: PrintStage.SAMPLE,
    });
  });

  it('fail trước migration nếu dữ liệu đích trùng cùng orderId + stage', () => {
    expect(() =>
      buildPrintJobStageMigrationPlan([
        {
          _id: 'job-1',
          orderId: 'order-1',
          isSample: false,
          items: [],
        },
        {
          _id: 'job-2',
          orderId: 'order-1',
          stage: PrintStage.PRODUCTION,
          items: [],
        },
      ]),
    ).toThrow('order-1::PRODUCTION');
  });

  it('đưa job legacy reserve partial hoặc zero vào danh sách review thủ công', () => {
    const plan = buildPrintJobStageMigrationPlan([
      {
        _id: 'partial-job',
        orderId: 'order-partial',
        isSample: false,
        items: [{ orderItemId: 'line-1', quantity: 10, reservedQty: 5 }],
      },
      {
        _id: 'zero-job',
        orderId: 'order-zero',
        isSample: true,
        items: [{ orderItemId: 'line-2', quantity: 1, reservedQty: 0 }],
      },
      {
        _id: 'valid-job',
        orderId: 'order-valid',
        stage: PrintStage.PRODUCTION,
        items: [{ orderItemId: 'line-3', quantity: 3, reservedQty: 3 }],
      },
    ]);

    expect(plan.invalidReservationJobs).toEqual(['partial-job', 'zero-job']);
  });
});
