import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventsModule, QUEUES } from '@app/events';
import { validateEnv } from './config/env.validation';
import { NotificationConsumer } from './notification.consumer';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventsModule, // BullMQ + Redis
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION }), // queue đang consume
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationConsumer],
})
export class NotificationModule {}
