import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Khai báo role yêu cầu cho route (dùng kèm RolesGuard):
 *   `@Roles(WmsRole.MANAGER, WmsRole.RECEIVER)`.
 * Cho qua nếu user có ÍT NHẤT một role yêu cầu; ADMIN luôn bypass.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
