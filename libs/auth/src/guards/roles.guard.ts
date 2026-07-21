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
 * - ADMIN/ECOM_MANAGER luôn bypass.
 * - Còn lại: cho qua nếu user.role nằm trong danh sách role yêu cầu của route.
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
    const role = req.user?.role;

    if (role === WmsRole.ADMIN || role === EcomRole.ECOM_MANAGER) return true;
    if (role !== undefined && required.includes(role)) return true;

    throw new ForbiddenException('Không đủ quyền truy cập tài nguyên này');
  }
}
