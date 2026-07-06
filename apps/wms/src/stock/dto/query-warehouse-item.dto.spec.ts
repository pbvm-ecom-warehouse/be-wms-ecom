import { plainToInstance } from 'class-transformer';
import { QueryWarehouseItemDto } from './query-warehouse-item.dto';

describe('QueryWarehouseItemDto — transform isActive từ query-string', () => {
  it('isActive: "true" (string) → true', () => {
    const dto = plainToInstance(QueryWarehouseItemDto, { isActive: 'true' });
    expect(dto.isActive).toBe(true);
  });

  it('isActive: "false" (string) → false (bug cũ: Boolean("false") === true)', () => {
    const dto = plainToInstance(QueryWarehouseItemDto, { isActive: 'false' });
    expect(dto.isActive).toBe(false);
  });

  it('isActive: undefined → giữ nguyên undefined (không áp filter, không thành false)', () => {
    const dto = plainToInstance(QueryWarehouseItemDto, {
      isActive: undefined,
    });
    expect(dto.isActive).toBeUndefined();
  });
});
