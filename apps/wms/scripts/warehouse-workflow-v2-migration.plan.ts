type Identifier = unknown;

export interface MigrationScrapNoteRow {
  _id: Identifier;
  status: string;
  items?: Array<{
    sourceCellId?: Identifier;
    lockedQuantity?: number;
  }>;
}

export interface MigrationStockCountRow {
  _id: Identifier;
  status: string;
  items?: Array<{
    cellId?: Identifier;
  }>;
}

export interface WarehouseWorkflowV2MigrationPlan {
  disposeLegacyApprovedScrapIds: Identifier[];
  rejectUnsafeDraftScrapIds: Identifier[];
  cancelUnsafeStockCountIds: Identifier[];
}

function lacksQuarantineIdentity(row: MigrationScrapNoteRow): boolean {
  return (
    !row.items?.length ||
    row.items.some((item) => item.lockedQuantity === undefined)
  );
}

/**
 * Chỉ nhận diện chứng từ legacy bằng các field không tồn tại trong workflow mới.
 * Nhờ vậy chạy lại script không đụng phiếu APPROVED mới đang chờ chuyển SCRAP.
 */
export function buildWarehouseWorkflowV2MigrationPlan(input: {
  scrapNotes: MigrationScrapNoteRow[];
  stockCounts: MigrationStockCountRow[];
}): WarehouseWorkflowV2MigrationPlan {
  return {
    disposeLegacyApprovedScrapIds: input.scrapNotes
      .filter(
        (row) => row.status === 'APPROVED' && lacksQuarantineIdentity(row),
      )
      .map((row) => row._id),
    rejectUnsafeDraftScrapIds: input.scrapNotes
      .filter((row) => row.status === 'DRAFT' && lacksQuarantineIdentity(row))
      .map((row) => row._id),
    cancelUnsafeStockCountIds: input.stockCounts
      .filter(
        (row) =>
          ['DRAFT', 'IN_PROGRESS', 'COMPLETED'].includes(row.status) &&
          (!row.items?.length ||
            row.items.some(
              (item) => item.cellId === undefined || item.cellId === null,
            )),
      )
      .map((row) => row._id),
  };
}
