import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryLotReportDto } from './query-lot-report.dto';

describe('QueryLotReportDto', () => {
  it('page/limit mặc định 1/20', () => {
    const dto = plainToInstance(QueryLotReportDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('status không thuộc LotStatus → validation error', async () => {
    const dto = plainToInstance(QueryLotReportDto, { status: 'KHONG_HOP_LE' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('status hợp lệ (ACTIVE/EXPIRED) → không lỗi', async () => {
    const dto = plainToInstance(QueryLotReportDto, { status: 'ACTIVE' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
