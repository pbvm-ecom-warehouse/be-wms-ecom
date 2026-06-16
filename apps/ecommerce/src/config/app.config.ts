import { registerAs } from '@nestjs/config';

/** Cấu hình chung của app Ecommerce: port, CORS, môi trường chạy. */
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.ECOM_PORT!, 10),
  corsOrigins: process.env.ECOM_CORS_ORIGINS,
  env: (process.env.NODE_ENV ?? 'development') as
    | 'development'
    | 'test'
    | 'production',
}));
