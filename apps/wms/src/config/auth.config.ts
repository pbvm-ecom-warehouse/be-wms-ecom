import { registerAs } from '@nestjs/config';

/** JWT config của WMS — secret RIÊNG, không dùng chung với Ecommerce (luật #4). */
export const authConfig = registerAs('auth', () => ({
  jwtSecret: process.env.WMS_JWT_SECRET!,
  jwtExpiresIn: process.env.WMS_JWT_EXPIRES_IN!,
  refreshExpiresIn: process.env.WMS_REFRESH_EXPIRES_IN ?? '30d',
}));
