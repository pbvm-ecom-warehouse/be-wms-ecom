import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { AuthUser, JwtPayload } from '@app/auth';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { authConfig } from '../config/auth.config';

/**
 * Strategy 'jwt' của Ecommerce — verify bằng ECOM_JWT_SECRET (RIÊNG, khác WMS).
 * Token WMS ký bằng secret khác nên fail verify ở đây (luật #4).
 * Thứ tự extract: Authorization Bearer trước, fallback cookie access_token.
 * Cho phép web dùng cookie HttpOnly mà không cần JS đọc token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(authConfig.KEY) auth: ConfigType<typeof authConfig>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) =>
          (req?.cookies as Record<string, string> | undefined)?.[
            'access_token'
          ] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: auth.jwtSecret,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (payload.type !== 'customer' && payload.type !== 'admin') {
      throw new UnauthorizedException('Token không hợp lệ');
    }
    return payload;
  }
}
