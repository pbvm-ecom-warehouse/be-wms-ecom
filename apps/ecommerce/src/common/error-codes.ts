import { HttpStatus } from '@nestjs/common';

/**
 * Mã lỗi nghiệp vụ của Ecommerce app.
 * Thêm code theo domain tại đây — không thêm vào libs/common.
 * Xem pattern: libs/common/src/errors/error-codes.ts
 *
 * Ví dụ domain sau:
 *   CATALOG_PRODUCT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: '...' }
 *   ORDER_NOT_CANCELLABLE:     { status: HttpStatus.CONFLICT, message: '...' }
 *   PAYMENT_FAILED:            { status: HttpStatus.BAD_REQUEST, message: '...' }
 */
export const ECOM_ERRORS = {
  // Catalog
  CATALOG_CATEGORY_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Danh mục không tồn tại',
  },
  CATALOG_CATEGORY_SLUG_DUPLICATE: {
    status: HttpStatus.CONFLICT,
    message: 'Slug danh mục đã tồn tại',
  },
  CATALOG_PRODUCT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Sản phẩm không tồn tại',
  },
  CATALOG_PRODUCT_SLUG_DUPLICATE: {
    status: HttpStatus.CONFLICT,
    message: 'Slug sản phẩm đã tồn tại',
  },
  CATALOG_VARIANT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Biến thể sản phẩm không tồn tại',
  },
  CATALOG_VARIANT_SKU_DUPLICATE: {
    status: HttpStatus.CONFLICT,
    message: 'Mã SKU đã tồn tại',
  },
  CATALOG_DESIGN_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Mẫu thiết kế không tồn tại hoặc bạn không có quyền truy cập',
  },

  // Cart
  CART_EMPTY: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Giỏ hàng trống',
  },
  CART_ITEM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Sản phẩm không có trong giỏ hàng',
  },
  CART_VARIANT_NOT_AVAILABLE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Sản phẩm hiện không còn bán hoặc đã bị ẩn',
  },
  CART_PRINT_ITEM_REQUIRES_DESIGN: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Sản phẩm in ấn theo yêu cầu bắt buộc phải kèm thiết kế (designFile)',
  },

  // Order & Payment
  ORDER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Đơn hàng không tồn tại',
  },
  ORDER_PRINT_ITEM_REQUIRES_PREPAYMENT: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Đơn hàng có sản phẩm in custom phải thanh toán ONLINE trước',
  },
  ORDER_NOT_CANCELLABLE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Không thể hủy đơn hàng đã xuất kho hoặc đã tiến hành in',
  },
  ORDER_RETURN_EXPIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Đã quá hạn đổi trả (tối đa 7 ngày kể từ lúc giao hàng)',
  },
  ORDER_PRINT_ITEM_NOT_RETURNABLE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Sản phẩm in custom không hỗ trợ đổi trả tự động',
  },
  ORDER_ALREADY_PAID: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Đơn hàng đã được thanh toán',
  },
  ORDER_NOT_ONLINE_PAYMENT: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Đơn hàng không sử dụng phương thức thanh toán trực tuyến',
  },
} as const satisfies Record<string, { status: number; message: string }>;

export type EcomErrorCode = keyof typeof ECOM_ERRORS;

