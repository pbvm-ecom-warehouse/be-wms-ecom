export interface OffsetMeta {
  type: 'offset';
  page: number;
  limit: number;
  totalItems?: number;
  totalPages?: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CursorMeta {
  type: 'cursor';
  limit: number;
  nextCursor: string | null;
  hasNext: boolean;
}

/**
 * Marker để ResponseInterceptor nhận diện: trả về cái này từ controller thì
 * `items` thành `data` và `pagination` được gộp vào `meta`.
 */
export class PaginatedResult<T> {
  constructor(
    readonly items: T[],
    readonly pagination: OffsetMeta | CursorMeta,
  ) {}
}
