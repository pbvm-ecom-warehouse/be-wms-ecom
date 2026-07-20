/**
 * Vai trò nhân viên WMS (collection `users`). Khách Ecommerce không dùng roles.
 * Giữ dạng string union để khớp `roles: string[]` lưu trong DB.
 */
export enum WmsRole {
  ADMIN = 'ADMIN', // toàn quyền — RolesGuard luôn bypass cho ADMIN
  MANAGER = 'MANAGER',
  RECEIVER = 'RECEIVER', // nhập kho
  PICKER = 'PICKER', // xuất/soạn hàng
  PRINTER = 'PRINTER', // in ly
  COUNTER = 'COUNTER', // kiểm kho
  SHIPPER = 'SHIPPER', // quản lý vận đơn — từ lúc bàn giao hãng đến giao thành công/hoàn về
}

export enum EcomRole {
  ECOM_MANAGER = 'ECOM_MANAGER',
  CUSTOMER = 'customer',
}
