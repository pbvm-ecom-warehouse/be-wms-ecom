import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuerySupplierDto } from './supplier.dto';

describe('QuerySupplierDto', () => {
  it('page/limit dạng string từ query param (vd ?page=1&limit=20) phải convert sang number và pass validate', async () => {
    // plainToInstance KHÔNG excludeExtraneousValues — mô phỏng đúng cách
    // ValidationPipe({ transform: true }) tạo instance DTO từ req.query (luôn là string).
    const dto = plainToInstance(QuerySupplierDto, { page: '1', limit: '20' });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });
});
