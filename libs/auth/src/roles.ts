/**
 * Vai trò nhân viên WMS (collection `users`). Khách Ecommerce không dùng role này.
 * Giữ dạng string enum để khớp `role: string` lưu trong DB.
 */
export enum WmsRole {
  ADMIN = 'ADMIN', // toàn quyền — RolesGuard luôn bypass cho ADMIN
  MANAGER = 'MANAGER',
  RECEIVER = 'RECEIVER', // nhập kho
  /** @deprecated Chỉ giữ để đọc token/dữ liệu legacy; SHIPPER vận hành luồng xuất kho mới. */
  PICKER = 'PICKER',
  PRINTER = 'PRINTER', // in ly
  COUNTER = 'COUNTER', // kiểm kho
  SHIPPER = 'SHIPPER', // nhân viên kho: nhận phiếu xuất → pick/đóng kiện → giao/hoàn
}

/** Role được phép cấp mới. PICKER bị retire nhưng enum vẫn tồn tại để tương thích dữ liệu cũ. */
export const ASSIGNABLE_WMS_ROLES = Object.values(WmsRole).filter(
  (role) => role !== WmsRole.PICKER,
);

export enum EcomRole {
  ECOM_MANAGER = 'ECOM_MANAGER',
  CUSTOMER = 'customer',
}
