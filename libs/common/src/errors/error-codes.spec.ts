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

describe('ERROR_CATALOG — shipper, exact-cell và quarantine workflows', () => {
  it.each([
    ['GOODS_ISSUE_ALREADY_ASSIGNED', HttpStatus.CONFLICT],
    ['GOODS_ISSUE_ASSIGNEE_NOT_SHIPPER', HttpStatus.BAD_REQUEST],
    ['GOODS_ISSUE_NOT_ASSIGNED', HttpStatus.CONFLICT],
    ['GOODS_ISSUE_SHIPPER_REQUIRED', HttpStatus.BAD_REQUEST],
    ['GOODS_ISSUE_SOURCE_NOT_PICKABLE', HttpStatus.CONFLICT],
    ['GOODS_ISSUE_SOURCE_QUARANTINED', HttpStatus.CONFLICT],
    ['GOODS_RETURN_ITEM_NO_DIMENSIONS', HttpStatus.CONFLICT],
    ['GOODS_RETURN_LOT_NOT_ACTIVE', HttpStatus.CONFLICT],
    ['LAYOUT_RESET_REQUIRES_EMPTY_STOCK', HttpStatus.CONFLICT],
    ['PUTAWAY_ITEM_TYPE_NOT_ALLOWED', HttpStatus.BAD_REQUEST],
    ['PUTAWAY_ZONE_NOT_ALLOWED', HttpStatus.BAD_REQUEST],
    ['SCRAP_NOTE_ALREADY_DISPOSED', HttpStatus.CONFLICT],
    ['SCRAP_NOTE_CELL_NOT_FOUND', HttpStatus.NOT_FOUND],
    ['SCRAP_NOTE_ITEM_ALREADY_MOVED', HttpStatus.CONFLICT],
    ['SCRAP_NOTE_ITEM_MISMATCH', HttpStatus.BAD_REQUEST],
    ['SCRAP_NOTE_NOT_APPROVED', HttpStatus.CONFLICT],
    ['SCRAP_NOTE_NOT_QUARANTINED', HttpStatus.CONFLICT],
    ['SCRAP_NOTE_QTY_EXCEEDS_LOCKED_ROW', HttpStatus.CONFLICT],
    ['SCRAP_NOTE_SOURCE_ROW_LOCKED', HttpStatus.CONFLICT],
    ['SCRAP_NOTE_TARGET_NOT_SCRAP_ZONE', HttpStatus.BAD_REQUEST],
    ['SCRAP_ZONE_ALREADY_EXISTS', HttpStatus.CONFLICT],
    ['STOCK_BALANCE_INVALID', HttpStatus.CONFLICT],
    ['STOCK_BALANCE_NOT_FOUND', HttpStatus.NOT_FOUND],
    ['STOCK_COUNT_NOT_COUNTABLE', HttpStatus.CONFLICT],
    ['STOCK_COUNT_STALE_LINE', HttpStatus.CONFLICT],
  ] as const)('%s có HTTP status đúng', (code, status) => {
    expect(ERROR_CATALOG[code].status).toBe(status);
    expect(ERROR_CATALOG[code].message).not.toBe(code);
  });
});
