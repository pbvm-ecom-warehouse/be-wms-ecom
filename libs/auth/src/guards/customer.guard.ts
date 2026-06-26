import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../jwt-payload.interface';

/**
 * Kiểm tra xem người dùng hiện tại có phải là khách hàng (type === 'customer').
 * Thường dùng đi kèm sau JwtAuthGuard để bảo vệ các route dành riêng cho khách hàng.
 */
@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    
    if (req.user?.type !== 'customer') {
      throw new ForbiddenException('Chỉ khách hàng mới có quyền truy cập');
    }
    
    return true;
  }
}
