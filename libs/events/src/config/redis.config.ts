import { registerAs } from '@nestjs/config';

/** Cấu hình Redis dùng chung cho BullMQ (tất cả các app). */
export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  // Để undefined (không phải chuỗi rỗng) khi không đặt — ioredis bỏ qua nếu undefined.
  password: process.env.REDIS_PASSWORD || undefined,
}));
