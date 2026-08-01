import { buildWarehouseWorkflowV2MigrationPlan } from './warehouse-workflow-v2-migration.plan';

describe('warehouse workflow v2 migration plan', () => {
  it('đổi APPROVED legacy thành terminal nhưng giữ APPROVED mới để chuyển SCRAP', () => {
    const plan = buildWarehouseWorkflowV2MigrationPlan({
      scrapNotes: [
        {
          _id: 'legacy-approved',
          status: 'APPROVED',
          items: [{ sourceCellId: undefined, lockedQuantity: undefined }],
        },
        {
          _id: 'new-approved',
          status: 'APPROVED',
          items: [{ sourceCellId: 'cell-1', lockedQuantity: 2 }],
        },
        {
          _id: 'new-damaged-return',
          status: 'APPROVED',
          items: [{ sourceCellId: null, lockedQuantity: 1 }],
        },
      ],
      stockCounts: [],
    });

    expect(plan.disposeLegacyApprovedScrapIds).toEqual(['legacy-approved']);
  });

  it('đóng DRAFT scrap chưa khóa nguồn và stock count active thiếu cellId', () => {
    const plan = buildWarehouseWorkflowV2MigrationPlan({
      scrapNotes: [
        {
          _id: 'unsafe-draft',
          status: 'DRAFT',
          items: [{ sourceCellId: null, lockedQuantity: undefined }],
        },
        {
          _id: 'safe-draft',
          status: 'DRAFT',
          items: [{ sourceCellId: 'cell-1', lockedQuantity: 1 }],
        },
      ],
      stockCounts: [
        {
          _id: 'legacy-count',
          status: 'IN_PROGRESS',
          items: [{ cellId: undefined }],
        },
        {
          _id: 'new-count',
          status: 'DRAFT',
          items: [{ cellId: 'cell-1' }],
        },
        {
          _id: 'history',
          status: 'APPROVED',
          items: [{ cellId: undefined }],
        },
      ],
    });

    expect(plan.rejectUnsafeDraftScrapIds).toEqual(['unsafe-draft']);
    expect(plan.cancelUnsafeStockCountIds).toEqual(['legacy-count']);
  });
});
