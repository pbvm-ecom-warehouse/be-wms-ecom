import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EVENTS, QUEUES } from '@app/events';
import { Job } from 'bullmq';

/**
 * CONSUMER thông báo: lắng nghe notification-queue và gửi thông báo (email/SMS/push).
 * Hiện là STUB — chỉ log; nối nhà cung cấp gửi thật (mailer, SMS gateway) sau.
 * Đây là consumer THUẦN: không phát event đi đâu, không có DB.
 */
@Processor(QUEUES.NOTIFICATION)
export class NotificationConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationConsumer.name);

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.CUSTOMER_VERIFY_REQUESTED:
      case EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED:
      case EVENTS.PAYMENT_SUCCESS:
      case EVENTS.STOCK_LOW:
      case EVENTS.STOCK_NEAR_EXPIRY:
        // TODO: gọi nhà cung cấp gửi thật. Tạm log để xác nhận đã nhận event.
        this.logger.log(`📨 ${job.name} → ${JSON.stringify(job.data)}`);
        break;
      default:
        this.logger.warn(`Bỏ qua job lạ trên notification-queue: ${job.name}`);
    }
  }
}
