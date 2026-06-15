import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AuthUser, JwtPayload } from '@app/auth';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Env } from '../config/env.validation';

/**
 * Strategy 'jwt' của WMS — verify token bằng WMS_JWT_SECRET (RIÊNG, khác Ecommerce).
 * Token Ecommerce ký bằng secret khác nên sẽ fail verify ở đây (luật #4).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('WMS_JWT_SECRET', { infer: true }),
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
