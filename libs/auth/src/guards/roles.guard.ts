import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { WmsRole, EcomRole } from '../roles';
import { AuthUser } from '../jwt-payload.interface';

/**
 * Kiểm tra role nhân viên WMS. Đặt SAU JwtAuthGuard (cần request.user đã có).
 *
 * - Route không khai @Roles → cho qua (chỉ cần đăng nhập).
 * - ADMIN luôn bypass.
 * - Còn lại: cho qua nếu user.roles giao với danh sách role yêu cầu.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const roles = req.user?.roles ?? [];

    if (roles.includes(WmsRole.ADMIN) || roles.includes(EcomRole.ECOM_MANAGER)) return true; // ADMIN/ECOM_MANAGER toàn quyền
    if (roles.some((r) => required.includes(r))) return true;

    throw new ForbiddenException('Không đủ quyền truy cập tài nguyên này');
  }
}
