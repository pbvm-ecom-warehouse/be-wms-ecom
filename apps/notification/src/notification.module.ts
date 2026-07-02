import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule, buildPinoOptions } from '@app/common';
import { EventsModule, QUEUES } from '@app/events';
import { EmailModule } from './email/email.module';
import { FirebaseModule } from './firebase/firebase.module';
import { validateEnv } from './config/env.validation';
import { NotificationConsumer } from './notification.consumer';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildPinoOptions(config),
    }),
    CommonModule, // global filter/interceptor/pipe
    EventsModule, // BullMQ + Redis
    EmailModule, // Resend email service — gửi OTP verify/reset
    FirebaseModule,
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION }),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationConsumer],
})
export class NotificationModule {}
