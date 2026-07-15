import { HttpStatus } from '@nestjs/common';
import type { HttpStatus as HttpStatusType } from '@nestjs/common';

/**
 * Mã lỗi nghiệp vụ của WMS app.
 * Thêm code theo domain tại đây — không thêm vào libs/common.
 * Xem pattern: libs/common/src/errors/error-codes.ts
 *
 * Lưu ý: Warehouse structure codes (WAREHOUSE_*, ZONE_*, RACK_*, SHELF_*)
 * đã được di chuyển vào libs/common/src/errors/error-codes.ts tại ERROR_CATALOG
 * (cross-cutting infrastructure).
 */
export const WMS_ERRORS = {
  STOCK_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng trong kho',
  },
  STOCK_ITEM_SKU_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'SKU đã tồn tại trong hệ thống',
  },
  STOCK_INSUFFICIENT: {
    status: HttpStatus.CONFLICT,
    message: 'Số lượng tồn kho không đủ',
  },
  LOT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lô hàng',
  },
  PUTAWAY_TASK_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lệnh sắp xếp',
  },
  PUTAWAY_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng theo barcode đã quét',
  },
  PUTAWAY_SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy vị trí theo barcode đã quét',
  },
  PUTAWAY_SHELF_IS_STAGING: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Không thể xếp hàng vào chính vị trí nhận hàng tạm (staging)',
  },
  PUTAWAY_ITEM_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng hoặc lô quét được không thuộc lệnh sắp xếp này',
  },
  PUTAWAY_QTY_EXCEEDS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng quét vượt quá số lượng còn lại cần xếp',
  },
  GOODS_ISSUE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu xuất kho',
  },
  GOODS_ISSUE_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng theo barcode đã quét',
  },
  GOODS_ISSUE_SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy vị trí theo barcode đã quét',
  },
  GOODS_ISSUE_ITEM_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng quét được không thuộc phiếu xuất kho này',
  },
  GOODS_ISSUE_QTY_EXCEEDS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng quét vượt quá số lượng còn lại cần xuất',
  },
  PRINT_JOB_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lệnh in',
  },
  PRINT_JOB_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy mặt hàng theo barcode đã quét',
  },
  PRINT_JOB_SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy vị trí theo barcode đã quét',
  },
  PRINT_JOB_ITEM_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng quét được không thuộc lệnh in này',
  },
  PRINT_JOB_QTY_EXCEEDS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng quét vượt quá số lượng còn lại/đã tiêu thụ',
  },
  PRINT_JOB_ITEM_NOT_CONSUMED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Dòng chưa tiêu thụ hết CUP_BLANK, chưa thể xác nhận in xong',
  },
  PRINT_JOB_ITEM_ALREADY_COMPLETED: {
    status: HttpStatus.CONFLICT,
    message: 'Dòng này đã được xác nhận in xong trước đó',
  },
  STOCK_COUNT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu kiểm kho',
  },
  STOCK_COUNT_EMPTY_SCOPE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Không có tồn kho nào trong phạm vi đã chọn',
  },
  STOCK_COUNT_ITEM_MISMATCH: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Vị trí/lô không thuộc phiếu kiểm kho này',
  },
  STOCK_COUNT_ALREADY_APPROVED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu đã duyệt, không thể sửa',
  },
  STOCK_COUNT_NOT_COMPLETED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu chưa đếm xong, không thể duyệt',
  },
  SCRAP_NOTE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu hủy hàng',
  },
  SCRAP_NOTE_ITEM_ISPERISHABLE_NO_LOT: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng có hạn sử dụng phải chọn lô khi đề xuất hủy',
  },
  SCRAP_NOTE_QTY_EXCEEDS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Số lượng đề xuất hủy vượt quá tồn thật tại vị trí này',
  },
  SCRAP_NOTE_ALREADY_DECIDED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu đã được duyệt hoặc từ chối, không thể xử lý lại',
  },
  GOODS_RETURN_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy phiếu hoàn hàng',
  },
  GOODS_RETURN_ALREADY_DECIDED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu đã xử lý xong hoặc đã huỷ, không thể thao tác lại',
  },
  GOODS_RETURN_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Dòng hàng không tồn tại trong phiếu hoàn',
  },
  GOODS_RETURN_NOT_INSPECTED: {
    status: HttpStatus.CONFLICT,
    message: 'Phiếu chưa được kiểm tra tình trạng, không thể xác nhận',
  },
  GOODS_RETURN_ITEM_ISPERISHABLE_NO_LOT: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Mặt hàng có hạn sử dụng phải chọn lô khi nhập lại hàng tốt',
  },
} as const satisfies Record<
  string,
  { status: HttpStatusType; message: string }
>;

export type WmsErrorCode = keyof typeof WMS_ERRORS;
