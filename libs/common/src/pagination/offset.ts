import { OffsetMeta } from './paginated-result';

/**
 * Dựng meta phân trang offset. `totalItems` OPTIONAL: chỉ truyền khi màn admin
 * cần số trang (tốn thêm 1 query count). Không có thì suy hasNext từ số phần tử.
 */
export function buildOffsetMeta(
  itemCount: number,
  page: number,
  limit: number,
  totalItems?: number,
): OffsetMeta {
  if (totalItems !== undefined) {
    const totalPages = Math.ceil(totalItems / limit);
    return {
      type: 'offset',
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
  return {
    type: 'offset',
    page,
    limit,
    hasNext: itemCount === limit,
    hasPrev: page > 1,
  };
}
