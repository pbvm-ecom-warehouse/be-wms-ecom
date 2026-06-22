import { z } from 'zod';

/**
 * Schema biến môi trường của app Ecommerce. Validate lúc khởi động qua
 * ConfigModule.forRoot({ validate: validateEnv }) — thiếu/sai env thì app dừng ngay.
 * Đối xứng với apps/wms/src/config/env.validation.ts (đổi tiền tố WMS_ → ECOM_).
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

  ECOM_DATABASE_URL: z.string().min(1),

  // ---- Redis (BullMQ) ----
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_PASSWORD: z.string().optional(),

  FIREBASE_ADMIN_CREDENTIALS_PATH: z.string().min(1).optional(),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),

  // ---- Auth ----
  // Secret RIÊNG của Ecommerce, phải khác WMS_JWT_SECRET (luật #4) và ≥32 ký tự.
  ECOM_JWT_SECRET: z.string().min(32, 'ECOM_JWT_SECRET phải ≥ 32 ký tự'),
  ECOM_JWT_EXPIRES_IN: z.string().min(1), // access token: dài (vd 30d)
  ECOM_REFRESH_EXPIRES_IN: z.string().min(1).default('60d'),

  // ---- CORS ----
  ECOM_CORS_ORIGINS: z.string().optional(),

  ECOM_PORT: z.coerce.number().int().positive(),
});

export type Env = z.infer<typeof envSchema>;

/** Hàm validate truyền cho ConfigModule.forRoot({ validate: validateEnv }). */
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
