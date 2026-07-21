/**
 * Hợp đồng payload JWT dùng chung cho cả 2 app (nhưng KÝ bằng secret RIÊNG mỗi app
 * nên token chéo nhau không verify được — luật #4).
 *
 * - `user`     : nhân viên WMS (collection `users`), có `role` (single).
 * - `customer` : khách Ecommerce (collection `users` bên Ecom), role suy từ `type`.
 */
export type UserType = 'user' | 'customer' | 'admin';

export interface JwtPayload {
  sub: string; // id (_id) của user/customer
  type: UserType; // phân biệt token WMS vs Ecommerce
  role?: string; // 1 nhân viên/khách chỉ có đúng 1 role
  username?: string; // WMS
  email?: string; // Ecommerce
}

/** Object gắn vào `request.user` sau khi JwtStrategy.validate trả về. */
export type AuthUser = JwtPayload;
