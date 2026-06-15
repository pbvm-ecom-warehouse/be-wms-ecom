import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../jwt-payload.interface';

/**
 * Lấy user đã xác thực (payload JWT) khỏi request trong controller:
 *   `@CurrentUser() user: AuthUser`  hoặc  `@CurrentUser('sub') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    return field ? user?.[field] : user;
  },
);
