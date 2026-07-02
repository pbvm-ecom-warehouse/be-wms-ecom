import { z } from 'zod';

/**
 * Env app Notification — consumer thuần (chỉ cần Redis + port). Không có DB riêng,
 * không phát event đi đâu.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // ---- Logging & throttle (chuẩn cross-cutting) ----
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  THROTTLE_DEFAULT_TTL: z.coerce.number().int().positive().default(60_000),
  THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(100),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_PASSWORD: z.string().optional(),

  // Firebase Admin từ env (không đọc file). Cần đủ 3 trường mới bật.
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),

  // Email qua Resend. Thiếu RESEND_API_KEY/RESEND_FROM → email tắt mềm.
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM: z.string().min(1).optional(),

  NOTIFICATION_PORT: z.coerce.number().int().positive(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`❌ Biến môi trường không hợp lệ:\n${details}`);
  }
  return { ...config, ...parsed.data };
}
