import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { redisConfig } from './config/redis.config';

/**
 * Cấu hình kết nối Redis dùng chung cho BullMQ. Import EventsModule ở mỗi app,
 * rồi dùng BullModule.registerQueue(...) trong từng module để khai báo queue
 * mà app đó produce/consume.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      // forFeature đăng ký namespace 'redis' vào ConfigModule của module này
      imports: [ConfigModule.forFeature(redisConfig)],
      inject: [redisConfig.KEY],
      useFactory: (redis: ConfigType<typeof redisConfig>) => ({
        connection: {
          host: redis.host,
          port: redis.port,
          // Redis production bắt buộc có auth — undefined nếu env trống (dev local).
          password: redis.password,
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class EventsModule {}
