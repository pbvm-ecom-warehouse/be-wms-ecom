import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { authConfig } from '../config/auth.config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    process.env['WMS_JWT_SECRET'] = 'a'.repeat(32);
    process.env['WMS_JWT_EXPIRES_IN'] = '8h';
    process.env['WMS_REFRESH_EXPIRES_IN'] = '30d';

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forFeature(authConfig)],
      providers: [JwtStrategy],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('validate trả payload khi type=user', () => {
    const payload = {
      sub: 'id1',
      type: 'user' as const,
      role: 'ADMIN',
      username: 'admin',
    };
    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('validate throw khi type≠user', () => {
    const payload = { sub: 'id1', type: 'customer' as const, email: 'x@x.com' };
    expect(() => strategy.validate(payload)).toThrow();
  });
});
