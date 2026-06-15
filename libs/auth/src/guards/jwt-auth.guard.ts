import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard xác thực JWT dùng chung. Dựa trên strategy tên 'jwt' mà MỖI app tự đăng ký
 * (apps/<app>/src/auth/jwt.strategy.ts) bằng secret riêng — nên cùng một guard nhưng
 * verify bằng secret khác nhau ở mỗi process.
 *
 * Tôn trọng @Public() để bỏ qua xác thực cho login/register/health.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
