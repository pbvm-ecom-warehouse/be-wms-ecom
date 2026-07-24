import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryStockReportDto } from './query-stock-report.dto';

describe('QueryStockReportDto', () => {
  it('page/limit mặc định 1/20 khi không truyền field nào', () => {
    const dto = plainToInstance(QueryStockReportDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('không truyền sku vẫn hợp lệ (optional)', async () => {
    const dto = plainToInstance(QueryStockReportDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
