import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

describe('AppException', () => {
  it('dùng status + message mặc định từ catalog khi chỉ truyền code', () => {
    const ex = new AppException('NOT_FOUND');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.getResponse()).toEqual({
      code: 'NOT_FOUND',
      message: 'Không tìm thấy tài nguyên',
    });
  });

  it('cho phép override message, status và details', () => {
    const ex = new AppException('STOCK_INSUFFICIENT', 'Không đủ tồn', 409, [
      { field: 'quantity', issue: 'available=3 < requested=5' },
    ]);
    expect(ex.getStatus()).toBe(409);
    expect(ex.code).toBe('STOCK_INSUFFICIENT');
    expect(ex.getResponse()).toEqual({
      code: 'STOCK_INSUFFICIENT',
      message: 'Không đủ tồn',
      details: [{ field: 'quantity', issue: 'available=3 < requested=5' }],
    });
  });

  it('mã miền không có trong catalog + không truyền status → mặc định 400', () => {
    const ex = new AppException('ORDER_NOT_CANCELLABLE', 'Đơn không thể hủy');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});
