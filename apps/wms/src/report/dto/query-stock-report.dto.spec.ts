import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryStockReportDto } from './query-stock-report.dto';

describe('QueryStockReportDto', () => {
  it('page/limit mặc định 1/20 khi không truyền field nào', () => {
    const dto = plainToInstance(QueryStockReportDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('không truyền warehouseId/sku vẫn hợp lệ (cả 2 đều optional)', async () => {
    const dto = plainToInstance(QueryStockReportDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('warehouseId sai định dạng ObjectId → validation error', async () => {
    const dto = plainToInstance(QueryStockReportDto, {
      warehouseId: 'khong-phai-object-id',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'warehouseId')).toBe(true);
  });
});
