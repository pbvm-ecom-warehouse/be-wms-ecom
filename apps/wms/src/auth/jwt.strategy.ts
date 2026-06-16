import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { AuthUser, JwtPayload } from '@app/auth';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { authConfig } from '../config/auth.config';

/**
 * Strategy 'jwt' của WMS — verify token bằng WMS_JWT_SECRET (RIÊNG, khác Ecommerce).
 * Token Ecommerce ký bằng secret khác nên sẽ fail verify ở đây (luật #4).
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

  // Giá trị trả về được gắn vào request.user.
  validate(payload: JwtPayload): AuthUser {
    if (payload.type !== 'user') {
      throw new UnauthorizedException('Token không phải của nhân viên WMS');
    }
    return payload;
  }
}
