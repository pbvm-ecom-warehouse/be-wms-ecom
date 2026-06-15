import { AppException } from '../errors/app.exception';
import { buildCursorPage, buildKeysetFilter, decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('encode rồi decode trả lại payload ban đầu', () => {
    const c = encodeCursor({ sortValue: '2026-06-15T00:00:00.000Z', id: 'abc' });
    expect(typeof c).toBe('string');
    expect(decodeCursor(c)).toEqual({ sortValue: '2026-06-15T00:00:00.000Z', id: 'abc' });
  });

  it('cursor hỏng → AppException VALIDATION_FAILED', () => {
    expect(() => decodeCursor('@@@khong-phai-base64@@@')).toThrow(AppException);
  });

  it('buildKeysetFilter desc → $or so sánh (sortField,_id) bằng $lt', () => {
    const filter = buildKeysetFilter({
      sortField: 'createdAt',
      direction: 'desc',
      cursor: { sortValue: 'T', id: 'id1' },
    });
    expect(filter).toEqual({
      $or: [
        { createdAt: { $lt: 'T' } },
        { createdAt: 'T', _id: { $lt: 'id1' } },
      ],
    });
  });

  it('buildKeysetFilter không cursor → filter rỗng', () => {
    expect(buildKeysetFilter({ sortField: 'createdAt', direction: 'desc' })).toEqual({});
  });

  it('buildCursorPage: dư 1 bản ghi → hasNext=true, cắt còn limit, có nextCursor', () => {
    const rows = [
      { _id: 'a', createdAt: 't3' },
      { _id: 'b', createdAt: 't2' },
      { _id: 'c', createdAt: 't1' },
    ];
    const page = buildCursorPage(rows, 2, 'createdAt');
    expect(page.items).toHaveLength(2);
    expect(page.pagination).toMatchObject({ type: 'cursor', limit: 2, hasNext: true });
    expect((page.pagination as { nextCursor: string }).nextCursor).toBe(
      encodeCursor({ sortValue: 't2', id: 'b' }),
    );
  });

  it('buildCursorPage: không dư → hasNext=false, nextCursor=null', () => {
    const page = buildCursorPage([{ _id: 'a', createdAt: 't1' }], 2, 'createdAt');
    expect(page.items).toHaveLength(1);
    expect(page.pagination).toMatchObject({ hasNext: false, nextCursor: null });
  });
});
