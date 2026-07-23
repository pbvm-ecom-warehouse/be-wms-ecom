import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAttributeOptionDto } from './attribute-option.dto';

describe('UpdateAttributeOptionDto', () => {
  it('client gửi field code phải lọt qua ValidationPipe để service tự trả STOCK_ATTRIBUTE_CODE_IMMUTABLE — không bị strip/reject ở tầng DTO trước khi tới service', async () => {
    // whitelist + forbidNonWhitelisted mô phỏng đúng cấu hình ValidationPipe
    // global (libs/common/src/common.module.ts). Nếu DTO không khai báo
    // field `code`, ValidationPipe sẽ reject request với lỗi validation
    // chung ("property code should not exist") TRƯỚC KHI tới
    // AttributeOptionService.update — khiến check "code bất biến" trong
    // service (throw STOCK_ATTRIBUTE_CODE_IMMUTABLE) không bao giờ chạy
    // được qua HTTP thật. DTO phải khai báo `code` (optional) để pipe cho
    // qua, để service tự quyết định trả lỗi nghiệp vụ đúng.
    const dto = plainToInstance(UpdateAttributeOptionDto, {
      code: 'NEW',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
    expect(dto.code).toBe('NEW');
  });
});
