import { HttpStatus } from '@nestjs/common';
import { ERROR_CATALOG } from './error-codes';

describe('ERROR_CATALOG — WMS SKU/barcode codes (issue #25)', () => {
  it('chứa đủ 8 code mới của issue #25 với status đúng', () => {
    expect(ERROR_CATALOG.STOCK_SKU_TEMPLATE_NOT_FOUND.status).toBe(
      HttpStatus.NOT_FOUND,
    );
    expect(ERROR_CATALOG.STOCK_SKU_TEMPLATE_MISMATCH.status).toBe(
      HttpStatus.BAD_REQUEST,
    );
    expect(ERROR_CATALOG.STOCK_ATTRIBUTE_OPTION_NOT_FOUND.status).toBe(
      HttpStatus.NOT_FOUND,
    );
    expect(ERROR_CATALOG.STOCK_ATTRIBUTE_OPTION_INACTIVE.status).toBe(
      HttpStatus.BAD_REQUEST,
    );
    expect(ERROR_CATALOG.STOCK_ATTRIBUTE_CODE_CONFLICT.status).toBe(
      HttpStatus.CONFLICT,
    );
    expect(ERROR_CATALOG.STOCK_ATTRIBUTE_CODE_IMMUTABLE.status).toBe(
      HttpStatus.BAD_REQUEST,
    );
    expect(ERROR_CATALOG.STOCK_ITEM_SKU_CONFLICT.status).toBe(
      HttpStatus.CONFLICT,
    );
    expect(ERROR_CATALOG.STOCK_ITEM_BARCODE_CONFLICT.status).toBe(
      HttpStatus.CONFLICT,
    );
  });

  it('mọi code cũ của WMS_ERRORS (đã xóa) vẫn resolve đúng qua ERROR_CATALOG', () => {
    expect(ERROR_CATALOG.STOCK_ITEM_NOT_FOUND.status).toBe(
      HttpStatus.NOT_FOUND,
    );
    expect(ERROR_CATALOG.PRINT_JOB_ITEM_ALREADY_COMPLETED.status).toBe(
      HttpStatus.CONFLICT,
    );
    expect(ERROR_CATALOG.SHIPMENT_INVALID_TRANSITION.status).toBe(
      HttpStatus.BAD_REQUEST,
    );
  });
});
