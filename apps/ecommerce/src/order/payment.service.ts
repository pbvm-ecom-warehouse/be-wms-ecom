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

    // Xác định đợt thanh toán hiện tại và số tiền
    let phase = 1;
    let paymentAmount = 0;

    if (order.hasPrintItems) {
      // Đơn ly in:
      if (order.paymentStatus === PaymentStatus.UNPAID) {
        phase = 1;
        paymentAmount = order.total * 0.3;
      } else if (order.paymentStatus === PaymentStatus.DEPOSIT_PAID) {
        phase = 2;
        paymentAmount = order.total * 0.3;
      } else if (order.paymentStatus === PaymentStatus.PROGRESS_PAID) {
        if (order.paymentMethod === PaymentMethod.COD) {
          throw new AppException(
            'VALIDATION_FAILED',
            'Đơn hàng COD không cần thanh toán online đợt 3',
          );
        }
        phase = 3;
        paymentAmount = order.total * 0.4;
      } else {
        throw new AppException(
          'VALIDATION_FAILED',
          'Đơn hàng đã thanh toán đủ',
        );
      }
    } else {
      // Đơn thường (không in):
      if (order.paymentStatus === PaymentStatus.UNPAID) {
        phase = 1;
        paymentAmount =
          order.paymentMethod === PaymentMethod.ONLINE
            ? order.total
            : order.total * 0.5;
      } else {
        throw new AppException(
          'VALIDATION_FAILED',
          'Đơn hàng đã thanh toán đủ',
        );
      }
    }

    paymentAmount = Math.round(paymentAmount);

    const returnUrl = this.config.get<string>('PAYOS_RETURN_URL');
    const cancelUrl = this.config.get<string>('PAYOS_CANCEL_URL');

    if (!returnUrl || !cancelUrl) {
      throw new AppException(
        'INTERNAL',
        'Thiếu cấu hình PAYOS_RETURN_URL hoặc PAYOS_CANCEL_URL',
      );
    }

    // Tránh lỗi trùng orderCode của PayOS bằng cách thêm hậu tố đợt thanh toán
    const baseCodeNum = orderCodeToNumber(order.code);
    const orderCode = baseCodeNum * 10 + phase;
    const description = `Thanh toan ${order.code} D${phase}`.slice(0, 25);

    try {
      const paymentLinkRes = await this.payos.paymentRequests.create({
        orderCode,
        amount: paymentAmount,
        description,
        returnUrl,
        cancelUrl,
      });

      this.logger.log(
        `Tạo PayOS link thành công cho đơn ${order.code} đợt ${phase} -> orderCode=${orderCode}, amount=${paymentAmount}`,
      );
      return paymentLinkRes.checkoutUrl;
    } catch (err) {
      this.logger.error(
        `Lỗi khi tạo PayOS payment link cho đơn ${order.code} đợt ${phase}:`,
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

      // Giải mã mã số đơn hàng gốc bằng cách bỏ đi chữ số cuối cùng (số đợt thanh toán)
      const baseOrderCodeNum = Math.floor(webhookData.orderCode / 10);
      const orderCodeStr = numberToOrderCode(baseOrderCodeNum);
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

    // Hủy link thanh toán của cả 3 đợt có thể xảy ra
    for (const phase of [1, 2, 3]) {
      const orderCode = orderCodeToNumber(order.code) * 10 + phase;
      try {
        const paymentLink = await this.payos.paymentRequests.get(orderCode);
        if (paymentLink.status === 'PENDING') {
          await this.payos.paymentRequests.cancel(
            orderCode,
            reason.slice(0, 25),
          );
          this.logger.log(
            `Đã hủy link thanh toán PayOS của đơn ${order.code} đợt ${phase} (orderCode=${orderCode})`,
          );
        }
      } catch (err) {
        // Bỏ qua nếu lỗi (ví dụ link thanh toán đợt này chưa từng được tạo)
      }
    }
  }

  getSuccessRedirectUrl(orderCode: string): string {
    const url = this.config.get<string>('FRONTEND_PAY_SUCCESS_URL');
    const msg = encodeURIComponent('Thanh toán đơn hàng thành công');
    return `${url}?orderCode=${orderCode}&status=success&message=${msg}`;
  }

  getCancelRedirectUrl(orderCode: string, isFail = false): string {
    const url = this.config.get<string>('FRONTEND_PAY_CANCEL_URL');
    const messageText = isFail
      ? 'Thanh toán đơn hàng thất bại hoặc bị hủy'
      : 'Người dùng hủy thanh toán đơn hàng';
    const msg = encodeURIComponent(messageText);
    const statusVal = isFail ? 'fail' : 'cancel';
    return `${url}?orderCode=${orderCode}&status=${statusVal}&message=${msg}`;
  }
}
