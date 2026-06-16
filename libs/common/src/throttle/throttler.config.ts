import type { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * 1 throttler `default` toàn cục, số lấy từ env. Route auth override chặt hơn
 * bằng @AuthThrottle() (xem throttle.decorators). Health bỏ qua bằng @SkipThrottle().
 */
export function buildThrottlerOptions(
  config: ConfigService,
): ThrottlerModuleOptions {
  return [
    {
      name: 'default',
      ttl: config.get<number>('THROTTLE_DEFAULT_TTL') ?? 60_000,
      limit: config.get<number>('THROTTLE_DEFAULT_LIMIT') ?? 100,
    },
  ];
}
