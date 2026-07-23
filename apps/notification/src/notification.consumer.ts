import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserFcmToken } from '../../ecommerce/src/auth/schemas/user-fcm-token.schema';
import { ConfigService } from '@nestjs/config';
import {
  EVENTS,
  QUEUES,
  type CustomerEmailActionPayload,
  type CustomerGoogleRegisteredPayload,
  type PaymentSuccessPayload,
  type StockLowPayload,
  type StockNearExpiryPayload,
} from '@app/events';
import { Job } from 'bullmq';
import { EmailService } from './email/email.service';
import { FirebaseService } from './firebase/firebase.service';
import { VerifyEmail } from './email/templates/verify-email';
import { ResetPasswordEmail } from './email/templates/reset-password';
import { GoogleWelcomeEmail } from './email/templates/google-welcome';
import { StockLowAlertEmail } from './email/templates/stock-low-alert';
import { StockNearExpiryEmail } from './email/templates/stock-near-expiry';
import { PaymentSuccessEmail } from './email/templates/payment-success';

function toEmailPayload(raw: unknown): CustomerEmailActionPayload {
  return raw as CustomerEmailActionPayload;
}

/**
 * CONSUMER thông báo: verify/reset → gửi email OTP qua Resend; stock.low/
 * stock.near_expiry (S4-04) → email + FCM push cho MANAGER kho, graceful
 * degradation nếu thiếu provider; payment.success → email xác nhận thanh toán
 * cho khách hàng. Consumer THUẦN: không phát event, không DB.
 * idempotencyKey = job.id chống gửi trùng (chỉ có ý nghĩa với Resend — BullMQ
 * job.id KHÔNG deterministic cho stock.low/stock.near_expiry/payment.success vì
 * producer không truyền jobId, nên mỗi job vẫn có id riêng do BullMQ tự sinh).
 */
@Processor(QUEUES.NOTIFICATION)
export class NotificationConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    private readonly email: EmailService,
    private readonly firebase: FirebaseService,
    private readonly config: ConfigService,
    @InjectModel(UserFcmToken.name)
    private readonly fcmTokenModel: Model<UserFcmToken>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const key = job.id ?? `${job.name}:${Date.now()}`;
    switch (job.name) {
      case EVENTS.CUSTOMER_VERIFY_REQUESTED: {
        const { email, code } = toEmailPayload(job.data);
        await this.email.send({
          to: email,
          subject: 'Mã xác minh email',

          react: VerifyEmail({ code }),
          idempotencyKey: key,
        });
        break;
      }
      case EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED: {
        const { email, code } = toEmailPayload(job.data);
        await this.email.send({
          to: email,
          subject: 'Mã đặt lại mật khẩu',

          react: ResetPasswordEmail({ code }),
          idempotencyKey: key,
        });
        break;
      }
      case EVENTS.CUSTOMER_GOOGLE_REGISTERED: {
        const { email, password } = job.data as CustomerGoogleRegisteredPayload;
        await this.email.send({
          to: email,
          subject:
            'Chào mừng bạn đến với MateStock — Mật khẩu tài khoản của bạn',

          react: GoogleWelcomeEmail({ password: password ?? '' }),
          idempotencyKey: key,
        });
        break;
      }
      case EVENTS.STOCK_LOW: {
        const payload = job.data as StockLowPayload;
        const alertEmail = this.config.get<string>('WAREHOUSE_ALERT_EMAIL');
        let sent = false;
        if (this.email.isEnabled() && alertEmail) {
          await this.email.send({
            to: alertEmail,
            subject: `⚠️ Tồn kho thấp — SKU: ${payload.sku}`,
            react: StockLowAlertEmail(payload),
            idempotencyKey: key,
          });
          sent = true;
        }
        if (this.firebase.isEnabled()) {
          await this.firebase.getMessaging().send({
            topic: `stock_alert_${payload.warehouseId}`,
            notification: {
              title: `Tồn kho thấp — ${payload.sku}`,
              body: `Còn ${payload.available}/${payload.minQuantity}`,
            },
            data: {
              sku: payload.sku,
              warehouseId: payload.warehouseId,
              available: String(payload.available),
            },
          });
          sent = true;
        }
        if (!sent) {
          this.logger.warn(
            `stock.low cho ${payload.sku} — không có provider nào bật.`,
          );
        }
        break;
      }
      case EVENTS.STOCK_NEAR_EXPIRY: {
        const payload = job.data as StockNearExpiryPayload;
        const alertEmail = this.config.get<string>('WAREHOUSE_ALERT_EMAIL');
        let sent = false;
        if (this.email.isEnabled() && alertEmail) {
          await this.email.send({
            to: alertEmail,
            subject: `⏰ Lô hàng sắp hết hạn — SKU: ${payload.sku}`,
            react: StockNearExpiryEmail(payload),
            idempotencyKey: key,
          });
          sent = true;
        }
        if (this.firebase.isEnabled()) {
          await this.firebase.getMessaging().send({
            topic: 'stock_alert_expiry',
            notification: {
              title: `Hàng sắp hết hạn — ${payload.sku}`,
              body: `Lô ${payload.lotNumber} hết hạn ${payload.expiryDate}`,
            },
            data: {
              sku: payload.sku,
              lotNumber: payload.lotNumber,
              expiryDate: payload.expiryDate,
            },
          });
          sent = true;
        }
        if (!sent) {
          this.logger.warn(
            `stock.near_expiry cho ${payload.sku} lô ${payload.lotNumber} — không có provider nào bật.`,
          );
        }
        break;
      }
      case EVENTS.PAYMENT_SUCCESS: {
        const payload = job.data as PaymentSuccessPayload;
        await this.email.send({
          to: payload.customerEmail,
          subject: `Thanh toán thành công — Đơn hàng ${payload.orderId}`,
          react: PaymentSuccessEmail({
            orderId: payload.orderId,
            amount: payload.amount,
          }),
          idempotencyKey: key,
        });

        if (payload.customerId) {
          await this.sendPushNotificationToCustomer(
            payload.customerId,
            'Thanh toán thành công 🎉',
            `Đơn hàng ${payload.orderId} của bạn đã được thanh toán thành công với số tiền ${payload.amount.toLocaleString()}đ!`,
            { orderId: payload.orderId, type: 'PAYMENT_SUCCESS' },
          );
        }
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên notification-queue: ${job.name}`);
    }
  }

  private async sendPushNotificationToCustomer(
    customerId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!this.firebase.isEnabled()) return;
    try {
      if (!Types.ObjectId.isValid(customerId)) return;
      const tokens = await this.fcmTokenModel
        .find({ customerId: new Types.ObjectId(customerId) })
        .lean();
      const tokenList = tokens.map((t) => t.fcmToken);
      if (tokenList.length === 0) {
        this.logger.log(
          `Không tìm thấy FCM Token nào cho customer ${customerId}`,
        );
        return;
      }

      const response = await this.firebase.getMessaging().sendEachForMulticast({
        tokens: tokenList,
        notification: { title, body },
        data,
      });
      this.logger.log(
        `Đã gửi FCM Push Notification cho customer ${customerId}: ${response.successCount} thành công, ${response.failureCount} thất bại`,
      );
    } catch (err: any) {
      this.logger.error(
        `Lỗi khi gửi FCM Push Notification cho customer ${customerId}:`,
        err,
      );
    }
  }
}
