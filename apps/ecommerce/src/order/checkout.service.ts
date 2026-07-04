import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES, EVENTS } from '@app/events';
import { AppException } from '@app/common';
import { CartService } from '../cart/cart.service';
import { OrderRepository } from './order.repository';
import { CheckoutDto } from './dto/checkout.dto';
import { CustomerRepository } from '../auth/repositories/customer.repository';
import { CacheService } from '../cache/cache.service';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './schemas/order.schema';
import { Types } from 'mongoose';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly cartService: CartService,
    private readonly orderRepo: OrderRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
    private readonly cacheService: CacheService,
  ) {}

  async checkout(customerId: string, dto: CheckoutDto) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }

    const cart = await this.cartService.getCart(customerId);
    if (!cart.items || cart.items.length === 0) {
      throw new AppException('CART_EMPTY');
    }

    const hasPrintItems = cart.items.some((i) => i.isPrintItem);

    // Bắt buộc thanh toán ONLINE cho các đơn có ly in custom
    if (hasPrintItems && dto.paymentMethod === PaymentMethod.COD) {
      throw new AppException('ORDER_PRINT_ITEM_REQUIRES_PREPAYMENT');
    }

    // Kiểm tra và lấy địa chỉ giao nhận của khách
    const customer = await this.customerRepo.findActiveById(customerId);
    if (!customer) {
      throw new AppException(
        'UNAUTHENTICATED',
        'Khách hàng không hoạt động hoặc không tồn tại',
      );
    }

    const address = customer.addresses.find(
      (addr) => addr._id?.toString() === dto.addressId,
    );
    if (!address) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Địa chỉ giao hàng không tồn tại trong sổ địa chỉ',
      );
    }

    const shippingAddress = {
      recipientName: address.recipientName,
      phone: address.phone,
      line: address.line,
      ward: address.ward,
      district: address.district,
      province: address.province,
    };

    // Tính toán tiền hàng
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const shippingFee = 0; // Mặc định miễn phí giao hàng v1
    const total = subtotal + shippingFee;

    const deadlineMinutes =
      this.config.get<number>('PAYMENT_DEADLINE_MINUTES') ?? 30;
    const paymentDeadline =
      dto.paymentMethod === PaymentMethod.ONLINE
        ? new Date(Date.now() + deadlineMinutes * 60 * 1000)
        : null;

    const code = await this.orderRepo.generateOrderCode();

    // Tạo đơn hàng ở dạng tạm thời (optimistic)
    const order = await this.orderRepo.createOrder({
      code,
      customerId: new Types.ObjectId(customerId),
      items: cart.items.map((i) => ({
        sku: i.sku,
        name: i.sku, // v1: dùng sku làm tên
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        isPrintItem: i.isPrintItem,
        designFile: i.designFile,
        designId: i.designId,
      })),
      shippingAddress,
      subtotal,
      shippingFee,
      total,
      paymentMethod: dto.paymentMethod,
      paymentStatus: PaymentStatus.UNPAID,
      orderStatus: OrderStatus.PLACED,
      fulfillmentStatus: FulfillmentStatus.NONE,
      hasPrintItems,
      paymentDeadline,
      placedAt: new Date(),
    });

    // Làm trống giỏ hàng sau khi chốt đơn tạm thời
    await this.cartService.clearCart(customerId);

    // Xóa cache danh sách đơn hàng
    try {
      await this.cacheService.del(`ecom:orders:list:${customerId}`);
    } catch (cacheErr) {
      this.logger.error(`Lỗi khi xóa cache orders list của khách ${customerId}:`, cacheErr);
    }

    // Gửi yêu cầu kiểm kho và giữ tồn kho vật lý sang WMS
    await this.orderQueue.add(EVENTS.STOCK_RESERVE_REQUESTED, {
      orderId: order._id.toString(),
      items: cart.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
      preferWarehouse: 'CENTRAL',
    });

    this.logger.log(`Đặt đơn tạm thời thành công: ${code} -> Chờ WMS giữ kho`);

    // Thiết lập tiến trình tự động hủy đơn hàng ONLINE sau 30 phút nếu chưa trả tiền
    if (dto.paymentMethod === PaymentMethod.ONLINE) {
      await this.orderQueue.add(
        'auto.cancel',
        { orderId: order._id.toString() },
        {
          delay: deadlineMinutes * 60 * 1000,
          jobId: `auto-cancel:${order._id.toString()}`,
        },
      );
    }

    return order;
  }
}
