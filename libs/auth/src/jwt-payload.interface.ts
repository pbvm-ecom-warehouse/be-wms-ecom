/**
 * Hợp đồng payload JWT dùng chung cho cả 2 app (nhưng KÝ bằng secret RIÊNG mỗi app
 * nên token chéo nhau không verify được — luật #4).
 *
 * - `user`     : nhân viên WMS (collection `users`), có `roles`.
 * - `customer` : khách Ecommerce (collection `customers`), không có roles.
 */
export type UserType = 'user' | 'customer';

export interface JwtPayload {
  sub: string; // id (_id) của user/customer
  type: UserType; // phân biệt token WMS vs Ecommerce
  roles?: string[]; // chỉ token nhân viên WMS mới có
  username?: string; // WMS
  email?: string; // Ecommerce
}

/** Object gắn vào `request.user` sau khi JwtStrategy.validate trả về. */
export type AuthUser = JwtPayload;
