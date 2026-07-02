import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { PaymentMethod, PaymentStatus } from './schemas/order.schema';
import { AppException } from '@app/common';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly orderRepo: OrderRepository,
    private readonly orderService: OrderService,
  ) {}

  /**
   * Tạo URL redirect sang cổng thanh toán VNPay Sandbox.
   */
  async createVnpayUrl(orderId: string, ipAddr: string): Promise<string> {
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

    const tmnCode = this.config.get<string>('VNPAY_TMN_CODE');
    const secretKey = this.config.get<string>('VNPAY_SECRET_KEY');
    const returnUrl = this.config.get<string>('VNPAY_RETURN_URL');

    if (!tmnCode || !secretKey || !returnUrl) {
      throw new AppException(
        'INTERNAL',
        'Cấu hình VNPay trên máy chủ chưa hoàn tất',
      );
    }

    const vnpUrl = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const now = new Date();
    const createDate = now
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    // Hạn thanh toán sau 30 phút khớp với auto-cancel job
    const expireDate = new Date(now.getTime() + 30 * 60 * 1000)
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Amount: String(order.total * 100), // VNPay nhân 100 để tính tiền xu VND
      vnp_CurrCode: 'VND',
      vnp_TxnRef: order.code,
      vnp_OrderInfo: `Thanh toan don hang ${order.code}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    // Sắp xếp các tham số theo bảng chữ cái để tạo chữ ký
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (acc, k) => ({ ...acc, [k]: params[k] }),
        {} as Record<string, string>,
      );

    const signData = Object.keys(sortedParams)
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(sortedParams[key]).replace(/%20/g, '+')}`,
      )
      .join('&');

    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    sortedParams['vnp_SecureHash'] = signed;

    const queryParams = Object.keys(sortedParams)
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(sortedParams[key]).replace(/%20/g, '+')}`,
      )
      .join('&');

    return `${vnpUrl}?${queryParams}`;
  }

  /**
   * Xử lý IPN (Instant Payment Notification) từ VNPay.
   */
  async handleVnpayIpn(
    query: Record<string, string>,
  ): Promise<{ RspCode: string; Message: string }> {
    const secretKey = this.config.get<string>('VNPAY_SECRET_KEY');
    if (!secretKey) {
      this.logger.error('Chưa cấu hình VNPAY_SECRET_KEY');
      return { RspCode: '99', Message: 'Internal configuration error' };
    }

    const secureHash = query['vnp_SecureHash'];
    const params = Object.fromEntries(
      Object.entries(query).filter(
        ([k]) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType',
      ),
    ) as Record<string, string>;

    // Sắp xếp
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (acc, k) => ({ ...acc, [k]: params[k] }),
        {} as Record<string, string>,
      );

    const signData = Object.keys(sortedParams)
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(sortedParams[key]).replace(/%20/g, '+')}`,
      )
      .join('&');

    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (signed !== secureHash) {
      this.logger.warn(
        'Giao dịch IPN VNPay bị từ chối do chữ ký số không khớp',
      );
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const orderCode = query['vnp_TxnRef'];
    const providerTxnId = query['vnp_TransactionNo'];
    const responseCode = query['vnp_ResponseCode'];
    const amount = parseInt(query['vnp_Amount'] ?? '0', 10) / 100;

    const order = await this.orderRepo.findByCode(orderCode);
    if (!order) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    // Đánh dấu thành công
    if (responseCode === '00') {
      try {
        await this.orderService.onPaymentSuccess(
          order._id.toString(),
          providerTxnId,
          amount,
          'VNPAY',
        );
        return { RspCode: '00', Message: 'Confirm success' };
      } catch (err) {
        this.logger.error(
          `Lỗi xử lý xác nhận thanh toán đơn hàng ${order._id.toString()}:`,
          err,
        );
        return { RspCode: '99', Message: 'Confirm failed' };
      }
    } else {
      this.logger.warn(
        `VNPay báo lỗi giao dịch thanh toán: Mã phản hồi = ${responseCode}`,
      );
      return { RspCode: '00', Message: 'Transaction failed confirmed' };
    }
  }
}
