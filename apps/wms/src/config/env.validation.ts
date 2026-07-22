import { z } from 'zod';

/**
 * Schema biến môi trường của app WMS. Validate lúc khởi động qua
 * ConfigModule.forRoot({ validate: validateEnv }) — thiếu/sai env thì app
 * dừng ngay thay vì chết giữa chừng lúc query.
 */
const envSchema = z.object({
  // Môi trường chạy: quyết định CORS có được phép mở (dev) hay bắt buộc whitelist (prod).
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // ---- Logging & throttle (chuẩn cross-cutting) ----
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  THROTTLE_DEFAULT_TTL: z.coerce.number().int().positive().default(60_000),
  THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(100),

  WMS_DATABASE_URL: z.string().min(1),

  // ---- Redis (BullMQ) ----
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(), // env là string → ép sang number
  REDIS_PASSWORD: z.string().optional(), // prod nên đặt; dev có thể trống

  // Firebase Admin từ env (không đọc file). Cần đủ 3 trường mới bật.
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),

  // Cloudinary (upload ảnh) — BẮT BUỘC, khác Firebase: thiếu là fail-fast lúc boot,
  // không tắt mềm, vì các nghiệp vụ cần ảnh (GRN, avatar...) phụ thuộc trực tiếp.
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  // ---- Auth ----
  // Secret JWT phải đủ dài (≥32 ký tự) chống brute-force. Token WMS dùng secret
  // RIÊNG, KHÔNG trùng Ecommerce (luật #4) — không check chéo được ở đây vì mỗi app
  // chỉ thấy env của mình, nên trách nhiệm đặt khác nhau nằm ở .env.
  WMS_JWT_SECRET: z.string().min(32, 'WMS_JWT_SECRET phải ≥ 32 ký tự'),
  WMS_JWT_EXPIRES_IN: z.string().min(1), // access token: ngắn (vd 8h)
  WMS_REFRESH_EXPIRES_IN: z.string().min(1).default('30d'), // refresh token: dài

  // ---- CORS ----
  // Danh sách origin được phép, ngăn cách bằng dấu phẩy. Để trống ở prod sẽ bị chặn
  // ở main.ts (không cho mở allow-all kèm credentials).
  WMS_CORS_ORIGINS: z.string().optional(),

  // Fill factor mặc định khi Shelf.fillFactor = null — dùng cho gợi ý put-away (S2-05).
  PUTAWAY_DEFAULT_FILL_FACTOR: z.coerce.number().min(0).max(1).default(0.75),

  WMS_PORT: z.coerce.number().int().positive(),
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
  // Giữ lại mọi env khác, đồng thời ghi đè các key đã ép kiểu (port → number).
  return { ...config, ...parsed.data };
}
