import 'dotenv/config';
import mongoose from 'mongoose';
import {
  buildPrintJobStageMigrationPlan,
  type LegacyPrintJobRow,
} from './print-job-stage-migration.plan';

/**
 * Migration deploy một lần (idempotent):
 * 1) tính trước target + chặn collision;
 * 2) bỏ unique index orderId legacy;
 * 3) backfill stage/canonical orderId và bỏ isSample;
 * 4) tạo compound unique orderId+stage.
 *
 * Không backfill orderItemId vì WMS không thể suy ra ID dòng Ecommerce một
 * cách đáng tin cậy. Script chỉ báo danh sách legacy cần xử lý thủ công.
 */
async function main(): Promise<void> {
  const uri = process.env.WMS_DATABASE_URL;
  if (!uri) throw new Error('WMS_DATABASE_URL is required');

  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const collection = connection.collection('print_jobs');
    const rows = await collection
      .find({})
      .project({
        _id: 1,
        orderId: 1,
        stage: 1,
        isSample: 1,
        'items.orderItemId': 1,
        'items.quantity': 1,
        'items.reservedQty': 1,
      })
      .toArray();
    const plan = buildPrintJobStageMigrationPlan(
      rows as unknown as LegacyPrintJobRow[],
    );
    const manualReviewJobs = [
      ...new Set([...plan.missingOrderItemIds, ...plan.invalidReservationJobs]),
    ];
    if (manualReviewJobs.length > 0) {
      throw new Error(
        `Migration bị chặn trước khi đổi index; cần xử lý thủ công PrintJob legacy: ${JSON.stringify(
          {
            missingOrderItemIds: plan.missingOrderItemIds,
            invalidReservationJobs: plan.invalidReservationJobs,
            manualReviewRequired: manualReviewJobs.length,
          },
        )}`,
      );
    }

    const indexes = await collection.indexes();
    for (const index of indexes) {
      const key = index.key as Record<string, number>;
      if (index.unique && key.orderId === 1 && Object.keys(key).length === 1) {
        await collection.dropIndex(index.name!);
      }
    }

    if (plan.updates.length > 0) {
      await collection.bulkWrite(
        plan.updates.map((update) => ({
          updateOne: {
            filter: { _id: update.id },
            update: {
              $set: {
                orderId: update.orderId,
                stage: update.stage,
                updatedAt: new Date(),
              },
              $unset: { isSample: '' },
            },
          },
        })) as never,
      );
    }

    await collection.createIndex(
      { orderId: 1, stage: 1 },
      { unique: true, name: 'orderId_1_stage_1' },
    );

    console.log(
      JSON.stringify(
        {
          migrated: plan.updates.length,
          missingOrderItemIds: plan.missingOrderItemIds,
          invalidReservationJobs: plan.invalidReservationJobs,
          manualReviewRequired: manualReviewJobs.length,
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
