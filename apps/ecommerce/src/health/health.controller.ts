import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@app/common';
import { QUEUES } from '@app/events';
import { Queue } from 'bullmq';
import { Connection, ConnectionStates } from 'mongoose';

/**
 * GET /api/shop/health — kiểm tra nhanh kết nối hạ tầng: Mongoose (ecom_db) + Redis.
 * Trả 503 nếu một trong hai down. Đối xứng với health-check bên WMS.
 * Bỏ throttle: monitor/load balancer gọi liên tục.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectQueue(QUEUES.STOCK) private readonly queue: Queue,
  ) {}

  @Get()
  async check() {
    const db =
      this.conn.readyState === ConnectionStates.connected ? 'up' : 'down';

    let redis: 'up' | 'down' = 'down';
    try {
      // queue.client lộ kiểu IRedisClient tối giản (không có ping) → cast tới ioredis.
      const client = (await this.queue.client) as unknown as {
        ping(): Promise<string>;
      };
      if ((await client.ping()) === 'PONG') redis = 'up';
    } catch {
      redis = 'down';
    }

    if (db === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({ status: 'error', db, redis });
    }
    return { status: 'ok', db, redis };
  }
}
