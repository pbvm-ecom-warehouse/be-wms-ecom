import { Throttle, SkipThrottle } from '@nestjs/throttler';

/**
 * Throttle CHẶT cho route auth (login/register/refresh/forgot...) chống brute-force.
 * Giá trị là HẰNG (5 req/60s): decorator được đánh giá lúc import class — trước khi
 * ConfigModule nạp .env — nên không đọc env an toàn ở đây. Mức `default` mới lấy từ env.
 */
const AUTH_TTL_MS = 60_000;
const AUTH_LIMIT = 5;

export const AuthThrottle = () => Throttle({ default: { ttl: AUTH_TTL_MS, limit: AUTH_LIMIT } });

// Re-export để app chỉ import từ @app/common.
export { SkipThrottle };
