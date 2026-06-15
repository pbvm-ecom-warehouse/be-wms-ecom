import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AuthUser, JwtPayload } from '@app/auth';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Env } from '../config/env.validation';

/**
 * Strategy 'jwt' của Ecommerce — verify bằng ECOM_JWT_SECRET (RIÊNG, khác WMS).
 * Token WMS ký bằng secret khác nên fail verify ở đây (luật #4).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('ECOM_JWT_SECRET', { infer: true }),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (payload.type !== 'customer') {
      throw new UnauthorizedException('Token không phải của khách hàng');
    }
    return payload;
  }
}
