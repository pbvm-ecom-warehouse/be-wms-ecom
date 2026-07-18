import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryPerformanceReportDto } from './query-performance-report.dto';

describe('QueryPerformanceReportDto', () => {
  it('không truyền field nào vẫn hợp lệ (tất cả đều optional)', async () => {
    const dto = plainToInstance(QueryPerformanceReportDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('dateFrom sai định dạng ISO date → validation error', async () => {
    const dto = plainToInstance(QueryPerformanceReportDto, {
      dateFrom: 'khong-phai-ngay',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'dateFrom')).toBe(true);
  });

  it('dateFrom/dateTo hợp lệ (ISO string) → không lỗi', async () => {
    const dto = plainToInstance(QueryPerformanceReportDto, {
      dateFrom: '2026-06-01T00:00:00.000Z',
      dateTo: '2026-07-01T00:00:00.000Z',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
