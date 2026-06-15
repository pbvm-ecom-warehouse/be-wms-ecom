import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@app/events';
import { HealthController } from './health.controller';

/**
 * Connection Mongoose là global (do DatabaseModule.forApp) nên inject @InjectConnection
 * được ở đây mà không cần import thêm. Chỉ cần đăng ký 1 queue để ping Redis.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.STOCK })],
  controllers: [HealthController],
})
export class HealthModule {}
