import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { AuthUser, JwtPayload } from '@app/auth';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { authConfig } from '../config/auth.config';

/**
 * Strategy 'jwt' của Ecommerce — verify bằng ECOM_JWT_SECRET (RIÊNG, khác WMS).
 * Token WMS ký bằng secret khác nên fail verify ở đây (luật #4).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(authConfig.KEY) auth: ConfigType<typeof authConfig>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
