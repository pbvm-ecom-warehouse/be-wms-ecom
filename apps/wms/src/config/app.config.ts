import { registerAs } from '@nestjs/config';

/** Cấu hình chung của app WMS: port, CORS, môi trường chạy. */
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.WMS_PORT!, 10),
  corsOrigins: process.env.WMS_CORS_ORIGINS,
  env: (process.env.NODE_ENV ?? 'development') as
    | 'development'
    | 'test'
    | 'production',
}));
