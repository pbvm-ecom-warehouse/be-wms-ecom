import { registerAs } from '@nestjs/config';

/** JWT config của Ecommerce — secret RIÊNG, không dùng chung với WMS (luật #4). */
export const authConfig = registerAs('auth', () => ({
  jwtSecret: process.env.ECOM_JWT_SECRET!,
  jwtExpiresIn: process.env.ECOM_JWT_EXPIRES_IN!,
  refreshExpiresIn: process.env.ECOM_REFRESH_EXPIRES_IN ?? '60d',
}));
