import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Cấu hình kết nối Redis dùng chung cho BullMQ. Import EventsModule ở mỗi app,
 * rồi dùng BullModule.registerQueue(...) trong từng module để khai báo queue
 * mà app đó produce/consume.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: parseInt(config.get<string>('REDIS_PORT', '6379'), 10),
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
