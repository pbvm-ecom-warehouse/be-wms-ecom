import 'dotenv/config';
import mongoose from 'mongoose';
import {
  buildWarehouseWorkflowV2MigrationPlan,
  type MigrationScrapNoteRow,
  type MigrationStockCountRow,
} from './warehouse-workflow-v2-migration.plan';

const MIGRATION_REASON =
  'Đã đóng tự động khi nâng cấp quy trình kiểm kê/hủy theo khoang chính xác.';

/**
 * Migration idempotent trước khi deploy workflow quarantine/SCRAP mới:
 * - APPROVED cũ đã trừ tồn là trạng thái terminal, đổi thành DISPOSED;
 * - DRAFT cũ chưa khóa exact source bị đóng để không xử lý lại sai tồn;
 * - Stock Count active thiếu cellId bị đóng, lịch sử APPROVED vẫn giữ nguyên.
 */
async function main(): Promise<void> {
  const uri = process.env.WMS_DATABASE_URL;
  if (!uri) throw new Error('WMS_DATABASE_URL is required');

  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const scrapCollection = connection.collection('scrap_notes');
    const stockCountCollection = connection.collection('stock_counts');
    const inventoryCollection = connection.collection('inventory_stocks');
    const [scrapNotes, stockCounts] = await Promise.all([
      scrapCollection
        .find({ status: { $in: ['DRAFT', 'APPROVED'] } })
        .project({
          _id: 1,
          status: 1,
          'items.sourceCellId': 1,
          'items.lockedQuantity': 1,
        })
        .toArray(),
      stockCountCollection
        .find({ status: { $in: ['DRAFT', 'IN_PROGRESS', 'COMPLETED'] } })
        .project({ _id: 1, status: 1, 'items.cellId': 1 })
        .toArray(),
    ]);
    const plan = buildWarehouseWorkflowV2MigrationPlan({
      scrapNotes: scrapNotes as unknown as MigrationScrapNoteRow[],
      stockCounts: stockCounts as unknown as MigrationStockCountRow[],
    });
    const migratedAt = new Date();

    if (plan.disposeLegacyApprovedScrapIds.length > 0) {
      await scrapCollection.updateMany(
        {
          _id: { $in: plan.disposeLegacyApprovedScrapIds as never[] },
          status: 'APPROVED',
        },
        [
          {
            $set: {
              status: 'DISPOSED',
              disposedAt: { $ifNull: ['$updatedAt', migratedAt] },
              disposedBy: { $ifNull: ['$approvedBy', '$createdBy'] },
            },
          },
        ],
      );
    }
    if (plan.rejectUnsafeDraftScrapIds.length > 0) {
      await scrapCollection.updateMany(
        {
          _id: { $in: plan.rejectUnsafeDraftScrapIds as never[] },
          status: 'DRAFT',
        },
        {
          $set: {
            status: 'REJECTED',
            rejectReason: MIGRATION_REASON,
            updatedAt: migratedAt,
          },
        },
      );
    }
    if (plan.cancelUnsafeStockCountIds.length > 0) {
      await stockCountCollection.updateMany(
        {
          _id: { $in: plan.cancelUnsafeStockCountIds as never[] },
          status: { $in: ['DRAFT', 'IN_PROGRESS', 'COMPLETED'] },
        },
        {
          $set: {
            status: 'CANCELLED',
            cancelReason: MIGRATION_REASON,
            cancelledAt: migratedAt,
            updatedAt: migratedAt,
          },
        },
      );
    }
    const quarantineBackfill = await inventoryCollection.updateMany(
      { quarantinedQuantity: { $exists: false } },
      [
        {
          $set: {
            quarantinedQuantity: {
              $cond: [
                { $eq: ['$isQuarantined', true] },
                { $max: [0, '$quantity'] },
                0,
              ],
            },
          },
        },
        {
          $set: {
            isQuarantined: { $gt: ['$quarantinedQuantity', 0] },
          },
        },
      ],
    );

    console.log(
      JSON.stringify(
        {
          legacyApprovedScrapDisposed:
            plan.disposeLegacyApprovedScrapIds.length,
          unsafeDraftScrapRejected: plan.rejectUnsafeDraftScrapIds.length,
          unsafeStockCountsCancelled: plan.cancelUnsafeStockCountIds.length,
          inventoryQuarantineRowsBackfilled: quarantineBackfill.modifiedCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
