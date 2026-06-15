import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Đánh dấu route bỏ qua JwtAuthGuard (vd login, register, health).
 * Chỉ có tác dụng khi JwtAuthGuard được đặt làm guard toàn cục.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
