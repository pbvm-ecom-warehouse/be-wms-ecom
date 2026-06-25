import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

export type OtpType = 'verify_email' | 'reset_password';

// Mã 6 số entropy thấp → bù bằng hạn ngắn + giới hạn thử + dùng-một-lần.
const OTP_TTL_SEC = 600; // 10 phút (TTL gốc Redis tự hết hạn)
const OTP_MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Lưu OTP trong Redis (keyspace `otp:*` của ecom). Vì OTP là dữ liệu phù du,
 * dùng-một-lần nên Redis (TTL gốc) hợp hơn Mongo. Chỉ lưu HASH của mã.
 */
@Injectable()
export class OtpStore implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: Number(config.getOrThrow('REDIS_PORT')),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    });
  }

  private key(customerId: string, type: OtpType) {
    return `otp:${type}:${customerId}`;
  }

  /** Cấp mã mới: ghi đè mã cũ + đặt TTL → mỗi khách/type chỉ 1 mã sống. */
  async issue(customerId: string, type: OtpType, code: string): Promise<void> {
    const key = this.key(customerId, type);
    await this.redis
      .multi()
      .del(key)
      .hset(key, { codeHash: hashCode(code), attempts: '0' })
      .expire(key, OTP_TTL_SEC)
      .exec();
  }

  /** Đúng → xóa key, true. Sai → attempts++, hết lần thì xóa, false. */
  async verify(customerId: string, type: OtpType, code: string): Promise<boolean> {
    const key = this.key(customerId, type);
    const data = await this.redis.hgetall(key);
    if (!data || !data.codeHash) return false;

    if (data.codeHash !== hashCode(code)) {
      const attempts = await this.redis.hincrby(key, 'attempts', 1);
      if (attempts >= OTP_MAX_ATTEMPTS) await this.redis.del(key);
      return false;
    }

    await this.redis.del(key);
    return true;
  }

  onModuleDestroy() {
    return this.redis.quit();
  }
}
