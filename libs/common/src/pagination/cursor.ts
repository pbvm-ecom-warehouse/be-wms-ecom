import { AppException } from '../errors/app.exception';
import { PaginatedResult } from './paginated-result';

export type SortDirection = 'asc' | 'desc';

interface CursorPayload {
  sortValue: unknown;
  id: string;
}

/** Mã hóa cursor (keyset) thành chuỗi opaque base64url — không lộ field nội bộ. */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Giải mã cursor; sai định dạng → VALIDATION_FAILED. */
export function decodeCursor(cursor: string): CursorPayload {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (typeof parsed !== 'object' || parsed === null || !('id' in parsed)) {
      throw new Error('shape');
    }
    return parsed;
  } catch {
    throw new AppException('VALIDATION_FAILED', 'Cursor không hợp lệ');
  }
}

/**
 * Dựng filter Mongo theo keyset: lấy bản ghi NẰM SAU cursor theo (sortField, _id).
 * Không dùng skip → nhanh & ổn định khi data thay đổi giữa các trang.
 */
export function buildKeysetFilter(opts: {
  sortField: string;
  direction: SortDirection;
  cursor?: CursorPayload;
}): Record<string, unknown> {
  const { sortField, direction, cursor } = opts;
  if (!cursor) return {};
  const cmp = direction === 'asc' ? '$gt' : '$lt';
  return {
    $or: [
      { [sortField]: { [cmp]: cursor.sortValue } },
      { [sortField]: cursor.sortValue, _id: { [cmp]: cursor.id } },
    ],
  };
}

/**
 * Từ mảng rows đã query (nên query limit+1 để biết còn trang sau), dựng
 * PaginatedResult cursor: cắt còn `limit`, sinh nextCursor từ phần tử cuối.
 */
export function buildCursorPage<T extends { _id: unknown }>(
  rows: T[],
  limit: number,
  sortField: string,
): PaginatedResult<T> {
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  let nextCursor: string | null = null;
  if (hasNext && items.length > 0) {
    const last = items[items.length - 1] as Record<string, unknown>;
    nextCursor = encodeCursor({ sortValue: last[sortField], id: String(last._id) });
  }
  return new PaginatedResult(items, { type: 'cursor', limit, nextCursor, hasNext });
}
