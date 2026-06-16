import { buildOffsetMeta } from './offset';

describe('buildOffsetMeta', () => {
  it('có totalItems → tính totalPages/hasNext/hasPrev', () => {
    expect(buildOffsetMeta(20, 1, 20, 137)).toEqual({
      type: 'offset',
      page: 1,
      limit: 20,
      totalItems: 137,
      totalPages: 7,
      hasNext: true,
      hasPrev: false,
    });
  });

  it('trang cuối có totalItems → hasNext=false', () => {
    expect(buildOffsetMeta(17, 7, 20, 137)).toMatchObject({
      hasNext: false,
      hasPrev: true,
    });
  });

  it('không totalItems → hasNext suy từ số phần tử trả về (đầy limit)', () => {
    expect(buildOffsetMeta(20, 2, 20)).toEqual({
      type: 'offset',
      page: 2,
      limit: 20,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('không totalItems, trả ít hơn limit → hasNext=false', () => {
    expect(buildOffsetMeta(5, 1, 20)).toMatchObject({
      hasNext: false,
      hasPrev: false,
    });
  });
});
