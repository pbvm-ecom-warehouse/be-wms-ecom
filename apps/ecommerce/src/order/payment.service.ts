import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { PaymentMethod, PaymentStatus } from './schemas/order.schema';
import { AppException } from '@app/common';
import { PayOS, type Webhook } from '@payos/node';

export function orderCodeToNumber(code: string): number {
  const clean = code.replace(/ORD-|-/gi, '');
  return parseInt(clean, 10);
}

export function numberToOrderCode(num: number | string): string {
  const str = String(num);
  const datePart = str.substring(0, 8); // YYYYMMDD
  const seqPart = str.substring(8); // NNN
  return `ORD-${datePart}-${seqPart}`;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly payos?: PayOS;

  constructor(
    private readonly config: ConfigService,
    private readonly orderRepo: OrderRepository,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
  ) {
    const clientId = this.config.get<string>('PAYOS_CLIENT_ID');
    const apiKey = this.config.get<string>('PAYOS_API_KEY');
    const checksumKey = this.config.get<string>('PAYOS_CHECKSUM_KEY');

    if (clientId && apiKey && checksumKey) {
      this.payos = new PayOS({ clientId, apiKey, checksumKey });
    } else {
      this.logger.error(
        'PayOS configuration is missing (PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY)',
      );
    }
  }

  /**
   * Tạo link thanh toán VietQR qua PayOS.
   */
  async createPayosPaymentLink(orderId: string): Promise<string> {
    if (!this.payos) {
      throw new AppException('INTERNAL', 'PayOS client chưa được cấu hình');
    }

    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new AppException('ORDER_NOT_FOUND');
    }
    if (order.paymentMethod !== PaymentMethod.ONLINE) {
      throw new AppException('ORDER_NOT_ONLINE_PAYMENT');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new AppException('ORDER_ALREADY_PAID');
    }

    const returnUrl = this.config.get<string>('PAYOS_RETURN_URL');
    const cancelUrl = this.config.get<string>('PAYOS_CANCEL_URL');

    if (!returnUrl || !cancelUrl) {
      throw new AppException(
        'INTERNAL',
        'Thiếu cấu hình PAYOS_RETURN_URL hoặc PAYOS_CANCEL_URL',
      );
    }

    const orderCode = orderCodeToNumber(order.code);
    const description = `Thanh toan ${order.code}`.slice(0, 25);

    try {
      const paymentLinkRes = await this.payos.paymentRequests.create({
        orderCode,
        amount: order.total,
        description,
        returnUrl,
        cancelUrl,
      });

      this.logger.log(
        `Tạo PayOS link thành công cho đơn ${order.code} -> orderCode=${orderCode}`,
      );
      return paymentLinkRes.checkoutUrl;
    } catch (err) {
      this.logger.error(
        `Lỗi khi tạo PayOS payment link cho đơn ${order.code}:`,
        err,
      );
      const message = err instanceof Error ? err.message : 'unknown error';
      throw new AppException(
        'INTERNAL',
        `Lỗi kết nối cổng thanh toán: ${message}`,
      );
    }
  }

  /**
   * Xử lý webhook từ PayOS (IPN).
   */
  async handlePayosWebhook(body: Webhook): Promise<{ success: boolean }> {
    if (!this.payos) {
      this.logger.error('PayOS client chưa được cấu hình');
      return { success: false };
    }

    try {
      // Xác thực chữ ký webhook nhận được từ payOS
      const webhookData = await this.payos.webhooks.verify(body);
      this.logger.log(
        `Xác thực webhook PayOS thành công cho orderCode: ${webhookData.orderCode}`,
      );

      // Chuyển orderCode số nguyên về dạng mã đơn hàng chuỗi ORD-...
      const orderCodeStr = numberToOrderCode(webhookData.orderCode);
      const order = await this.orderRepo.findByCode(orderCodeStr);
      if (!order) {
        this.logger.error(
          `Không tìm thấy đơn hàng tương ứng với orderCode: ${orderCodeStr}`,
        );
        return { success: false };
      }

      // Kiểm tra trạng thái thanh toán từ webhook data
      // Code "00" có nghĩa là thanh toán thành công
      if (webhookData.code === '00') {
        const amount = webhookData.amount;
        const providerTxnId = webhookData.reference;

        await this.orderService.onPaymentSuccess(
          order._id.toString(),
          providerTxnId,
          amount,
          'PAYOS',
          body,
        );

        this.logger.log(
          `Cập nhật thanh toán thành công cho đơn hàng: ${orderCodeStr}`,
        );
      } else {
        this.logger.warn(
          `PayOS báo giao dịch thất bại cho đơn ${orderCodeStr}: code=${webhookData.code}`,
        );
      }

      return { success: true };
    } catch (err: any) {
      this.logger.error('Lỗi khi xác thực hoặc xử lý PayOS webhook:', err);
      return { success: false };
    }
  }

  /**
   * Hủy link thanh toán PayOS (khi đơn hàng bị hủy khi vẫn chưa trả tiền).
   */
  async cancelPayosPaymentLink(
    orderId: string,
    reason = 'Đơn hàng bị hủy',
  ): Promise<void> {
    if (!this.payos) {
      this.logger.error('PayOS client chưa được cấu hình');
      return;
    }

    const order = await this.orderRepo.findById(orderId);
    if (!order) return;

    const orderCode = orderCodeToNumber(order.code);

    try {
      // Kiểm tra xem link thanh toán có đang hoạt động không
      const paymentLink = await this.payos.paymentRequests.get(orderCode);

      // Chỉ hủy khi link thanh toán vẫn ở trạng thái PENDING
      if (paymentLink.status === 'PENDING') {
        await this.payos.paymentRequests.cancel(orderCode, reason.slice(0, 25));
        this.logger.log(
          `Đã hủy link thanh toán PayOS của đơn ${order.code} (orderCode=${orderCode})`,
        );
      }
    } catch (err) {
      // Nếu link thanh toán chưa được tạo hoặc đã hủy rồi, có thể bỏ qua hoặc log warn
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(
        `Không thể hủy link thanh toán PayOS của đơn ${order.code}: ${message}`,
      );
    }
  }

  getSuccessRedirectUrl(orderCode: string): string {
    const url = this.config.get<string>('FRONTEND_PAY_SUCCESS_URL');
    const msg = encodeURIComponent('Thanh toán đơn hàng thành công');
    return `${url}?orderCode=${orderCode}&status=success&message=${msg}`;
  }

  getCancelRedirectUrl(orderCode: string, isFail = false): string {
    const url = this.config.get<string>('FRONTEND_PAY_CANCEL_URL');
    const messageText = isFail ? 'Thanh toán đơn hàng thất bại hoặc bị hủy' : 'Người dùng hủy thanh toán đơn hàng';
    const msg = encodeURIComponent(messageText);
    const statusVal = isFail ? 'fail' : 'cancel';
    return `${url}?orderCode=${orderCode}&status=${statusVal}&message=${msg}`;
  }
}
