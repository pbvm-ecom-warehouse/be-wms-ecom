import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EVENTS, QUEUES, type CustomerEmailActionPayload } from '@app/events';
import { Job } from 'bullmq';
import { EmailService } from './email/email.service';
import { VerifyEmail } from './email/templates/verify-email';
import { ResetPasswordEmail } from './email/templates/reset-password';

/**
 * CONSUMER thông báo: verify/reset → gửi email OTP qua Resend.
 * Consumer THUẦN: không phát event, không DB. idempotencyKey = job.id chống gửi trùng.
 */
@Processor(QUEUES.NOTIFICATION)
export class NotificationConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(private readonly email: EmailService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const key = job.id ?? `${job.name}:${Date.now()}`;
    switch (job.name) {
      case EVENTS.CUSTOMER_VERIFY_REQUESTED: {
        const { email, code } = job.data as CustomerEmailActionPayload;
        await this.email.send({
          to: email,
          subject: 'Mã xác minh email',
          react: VerifyEmail({ code }),
          idempotencyKey: key,
        });
        break;
      }
      case EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED: {
        const { email, code } = job.data as CustomerEmailActionPayload;
        await this.email.send({
          to: email,
          subject: 'Mã đặt lại mật khẩu',
          react: ResetPasswordEmail({ code }),
          idempotencyKey: key,
        });
        break;
      }
      case EVENTS.PAYMENT_SUCCESS:
      case EVENTS.STOCK_LOW:
      case EVENTS.STOCK_NEAR_EXPIRY:
        // TODO: producer chưa build — tạm log để xác nhận đã nhận event.
        this.logger.log(`📨 ${job.name} → ${JSON.stringify(job.data)}`);
        break;
      default:
        this.logger.warn(`Bỏ qua job lạ trên notification-queue: ${job.name}`);
    }
  }
}
