import { z } from 'zod';

/**
 * Env app Notification — consumer thuần (chỉ cần Redis + port). Không có DB riêng,
 * không phát event đi đâu.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_PASSWORD: z.string().optional(),

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
