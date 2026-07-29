import { PrintStage } from '@app/events';

export interface LegacyPrintJobRow {
  _id: unknown;
  orderId: unknown;
  stage?: unknown;
  isSample?: unknown;
  items?: (Record<string, unknown> & { orderItemId?: unknown })[];
}

export interface PrintJobStageMigrationUpdate {
  id: unknown;
  orderId: string;
  stage: PrintStage;
}

export interface PrintJobStageMigrationPlan {
  updates: PrintJobStageMigrationUpdate[];
  /** Chỉ báo cáo để xử lý thủ công; tuyệt đối không bịa ID map về Ecommerce. */
  missingOrderItemIds: string[];
  /** Job partial/zero từ logic legacy không thể hoàn tất an toàn theo contract mới. */
  invalidReservationJobs: string[];
}

/**
 * Tính toàn bộ target trước khi drop index legacy. Nếu target collision thì
 * fail ngay, giữ DB chưa bị thay đổi để người vận hành xử lý an toàn.
 */
export function buildPrintJobStageMigrationPlan(
  rows: LegacyPrintJobRow[],
): PrintJobStageMigrationPlan {
  const seenKeys = new Map<string, string>();
  const updates: PrintJobStageMigrationUpdate[] = [];
  const missingOrderItemIds: string[] = [];
  const invalidReservationJobs: string[] = [];

  for (const row of rows) {
    const id = String(row._id);
    if (typeof row.orderId !== 'string' || row.orderId.trim().length === 0) {
      throw new Error(`PrintJob ${id} thiếu orderId hợp lệ.`);
    }
    const hasCanonicalStage =
      row.stage === PrintStage.SAMPLE || row.stage === PrintStage.PRODUCTION;
    let stage: PrintStage;
    if (row.stage === PrintStage.SAMPLE) {
      stage = PrintStage.SAMPLE;
    } else if (row.stage === PrintStage.PRODUCTION) {
      stage = PrintStage.PRODUCTION;
    } else {
      stage =
        row.isSample === true || row.orderId.endsWith('-sample')
          ? PrintStage.SAMPLE
          : PrintStage.PRODUCTION;
    }
    const orderId =
      !hasCanonicalStage &&
      stage === PrintStage.SAMPLE &&
      row.orderId.endsWith('-sample')
        ? row.orderId.slice(0, -'-sample'.length)
        : row.orderId;
    const key = `${orderId}::${stage}`;
    const duplicateId = seenKeys.get(key);
    if (duplicateId) {
      throw new Error(
        `Không thể migrate do trùng khóa ${key}: ${duplicateId}, ${id}.`,
      );
    }
    seenKeys.set(key, id);
    updates.push({ id: row._id, orderId, stage });

    if (
      !Array.isArray(row.items) ||
      row.items.some(
        (item) =>
          typeof item.orderItemId !== 'string' ||
          item.orderItemId.trim().length === 0,
      )
    ) {
      missingOrderItemIds.push(id);
    }
    if (
      !Array.isArray(row.items) ||
      row.items.some((item) => {
        const quantity = item.quantity;
        const reservedQty = item.reservedQty;
        return (
          typeof quantity !== 'number' ||
          !Number.isInteger(quantity) ||
          quantity <= 0 ||
          typeof reservedQty !== 'number' ||
          !Number.isInteger(reservedQty) ||
          reservedQty <= 0 ||
          reservedQty !== quantity
        );
      })
    ) {
      invalidReservationJobs.push(id);
    }
  }

  return { updates, missingOrderItemIds, invalidReservationJobs };
}
