import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EVENTS, QUEUES, type PaymentSuccessPayload } from '@app/events';
import { AppException } from '@app/common';
import { OrderRepository } from './order.repository';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Order,
} from './schemas/order.schema';
import { TxnStatus, TxnType } from './schemas/payment-transaction.schema';
import { Types } from 'mongoose';
import { PaymentService } from './payment.service';
import { UserRepository } from '../auth/repositories/user.repository';

const DUPLICATE_KEY_CODE = 11000;

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly repo: OrderRepository,
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notifyQueue: Queue,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly userRepo: UserRepository,
  ) {}

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID đơn hàng không hợp lệ');
    }
    const order = await this.repo.findById(id);
    if (!order) {
      throw new AppException('ORDER_NOT_FOUND');
    }
    return order;
  }

  async listByCustomer(customerId: string) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }
    return this.repo.listByCustomer(customerId);
  }

  async listAll() {
    return this.repo.listAll();
  }

  /**
   * Gọi sau khi WMS phản hồi giữ kho thành công (STOCK_RESERVED).
   *   - Nếu COD -> xác nhận và chuyển sang đóng gói.
   *   - Nếu ONLINE -> tiếp tục chờ thanh toán.
   */
  async onStockReserved(orderId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    if (order.paymentMethod === PaymentMethod.COD) {
      // COD -> Xác nhận ngay -> Chuyển sang READY_TO_PICK
      await this.repo.updateOrder(orderId, {
        orderStatus: OrderStatus.CONFIRMED,
        fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      });

      // Báo kho đóng gói xuất hàng
      await this.orderQueue.add(EVENTS.ORDER_READY_TO_FULFILL, {
        orderId,
        fulfillWarehouseId: order.fulfillWarehouseId,
        items: order.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
        shippingAddress: order.shippingAddress,
        recipient: {
          name: order.shippingAddress.recipientName,
          phone: order.shippingAddress.phone,
        },
        paymentMethod: 'COD',
        codAmount: order.total,
      });

      this.logger.log(
        `Đơn COD ${orderId} -> CONFIRMED & READY_TO_PICK -> Đã phát lệnh xuất kho`,
      );
    }
  }

  /**
   * Gọi khi webhook xác nhận thanh toán thành công.
   * Cập nhật PAID, duyệt đơn, phát lệnh in (nếu có ly in) hoặc lệnh xuất kho.
   */
  async onPaymentSuccess(
    orderId: string,
    providerTxnId: string,
    amount: number,
    provider: string,
    rawPayload: Record<string, any> = {},
  ) {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw new AppException('ORDER_NOT_FOUND');
    }

    // Idempotency: nếu đơn đã thanh toán trước đó
    if (order.paymentStatus === PaymentStatus.PAID) {
      this.logger.warn(
        `Thanh toán trùng lặp: Đơn hàng ${orderId} đã ở trạng thái PAID`,
      );
      return order;
    }

    // Ghi nhận dòng tiền thanh toán
    try {
      await this.repo.appendTransaction({
        orderId: new Types.ObjectId(order._id.toString()),
        type: TxnType.CHARGE,
        provider,
        amount,
        status: TxnStatus.SUCCESS,
        providerTxnId,
        raw: rawPayload,
      });
    } catch (err: unknown) {
      if ((err as { code?: number }).code === DUPLICATE_KEY_CODE) {
        this.logger.warn(
          `Mã giao dịch ${providerTxnId} đã được xử lý (idempotency) -> Bỏ qua`,
        );
        return order;
      }
      throw err;
    }

    const nextFulfillment = order.hasPrintItems
      ? FulfillmentStatus.AWAITING_PRINT
      : FulfillmentStatus.READY_TO_PICK;

    const updated = await this.repo.updateOrder(orderId, {
      paymentStatus: PaymentStatus.PAID,
      orderStatus: OrderStatus.CONFIRMED,
      fulfillmentStatus: nextFulfillment,
    });

    // Báo khách hàng thanh toán thành công (Ecom → Notification)
    const customer = await this.userRepo.findActiveById(order.customerId);
    if (customer) {
      const payload: PaymentSuccessPayload = {
        orderId,
        customerEmail: customer.email,
        amount,
      };
      await this.notifyQueue.add(EVENTS.PAYMENT_SUCCESS, payload, {
        removeOnComplete: true,
      });
    } else {
      this.logger.warn(
        `Không tìm thấy customer ${order.customerId.toString()} cho đơn ${orderId} → bỏ qua payment.success`,
      );
    }

    if (order.hasPrintItems) {
      // Đơn ly in -> Phát lệnh in sang WMS xưởng in
      await this.orderQueue.add(EVENTS.PRINT_REQUESTED, {
        orderId,
        items: order.items
          .filter((i) => i.isPrintItem)
          .map((i) => ({
            sku: i.sku,
            quantity: i.quantity,
            designFile: i.designFile,
          })),
      });
      this.logger.log(
        `Đơn in custom ${orderId} -> AWAITING_PRINT -> Phát lệnh in thành công`,
      );
    } else {
      // Đơn thường -> Phát lệnh xuất kho
      await this.orderQueue.add(EVENTS.ORDER_READY_TO_FULFILL, {
        orderId,
        fulfillWarehouseId: order.fulfillWarehouseId,
        items: order.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
        shippingAddress: order.shippingAddress,
        recipient: {
          name: order.shippingAddress.recipientName,
          phone: order.shippingAddress.phone,
        },
        paymentMethod: 'ONLINE',
      });
      this.logger.log(
        `Đơn hàng thường ${orderId} -> READY_TO_PICK -> Phát lệnh xuất kho thành công`,
      );
    }

    // Phát sự kiện thanh toán thành công để gửi email thông báo
    try {
      const user = await this.userRepo.findActiveById(order.customerId);
      const customerEmail = user?.email ?? '';
      await this.notifyQueue.add(EVENTS.PAYMENT_SUCCESS, {
        orderId: order._id.toString(),
        customerEmail,
        amount: order.total,
      });
      this.logger.log(`Phát sự kiện PAYMENT_SUCCESS thành công cho đơn ${order.code}`);
    } catch (err: any) {
      this.logger.error(`Lỗi khi phát sự kiện PAYMENT_SUCCESS cho đơn ${order.code}:`, err);
    }
 
    return updated;
  }

  /**
   * Hủy đơn hàng (do khách chủ động hủy hoặc do quá hạn thanh toán).
   */
  async cancelOrder(orderId: string, reason = '') {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    // Ràng buộc trạng thái hủy: chỉ hủy trước khi hàng được đóng gói xuất kho
    const allowedCancel = [
      FulfillmentStatus.NONE,
      FulfillmentStatus.AWAITING_PRINT,
      FulfillmentStatus.READY_TO_PICK,
    ];

    if (!allowedCancel.includes(order.fulfillmentStatus)) {
      throw new AppException(
        'ORDER_NOT_CANCELLABLE',
        'Hàng đã được đóng gói hoặc xuất kho, không thể hủy đơn',
      );
    }

    // Đối với ly in custom: không cho hủy khi đã đưa xuống xưởng in
    if (
      order.hasPrintItems &&
      order.fulfillmentStatus === FulfillmentStatus.AWAITING_PRINT
    ) {
      throw new AppException(
        'ORDER_NOT_CANCELLABLE',
        'Đơn hàng in ấn đã đưa vào sản xuất, không thể hủy đơn',
      );
    }

    await this.repo.updateOrder(orderId, {
      orderStatus: OrderStatus.CANCELLED,
      cancelReason: reason,
    });

    // Phát lệnh cho WMS giải phóng kho
    await this.orderQueue.add(EVENTS.ORDER_CANCELLED, {
      orderId,
      reason,
    });

    // Nếu đơn hàng đã PAID trước đó -> chuyển sang REFUND_PENDING để thực hiện hoàn tiền sau
    if (order.paymentStatus === PaymentStatus.PAID) {
      await this.repo.updateOrder(orderId, {
        paymentStatus: PaymentStatus.REFUND_PENDING,
      });
    } else if (order.paymentMethod === PaymentMethod.ONLINE) {
      // Nếu chưa trả tiền và là đơn ONLINE -> tự động hủy link thanh toán PayOS
      await this.paymentService.cancelPayosPaymentLink(orderId, reason);
    }

    this.logger.log(`Hủy đơn hàng thành công: ${orderId} -> Lý do: ${reason}`);
  }

  /**
   * Hoàn trả hàng (RMA) sau khi giao thành công trong hạn 7 ngày.
   */
  async returnOrder(orderId: string, customerId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) {
      throw new AppException('ORDER_NOT_FOUND');
    }

    if (order.customerId.toString() !== customerId) {
      throw new AppException(
        'FORBIDDEN',
        'Bạn không có quyền thao tác trên đơn hàng này',
      );
    }

    if (order.fulfillmentStatus !== FulfillmentStatus.DELIVERED) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Chỉ hỗ trợ hoàn trả khi đơn hàng đã giao thành công',
      );
    }

    // Kiểm tra thời hạn 7 ngày
    const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const deliveredAt =
      order.placedAt ?? (order as unknown as { createdAt: Date }).createdAt; // hoặc lấy trường updatedAt gần nhất
    if (Date.now() - new Date(deliveredAt).getTime() > RETURN_WINDOW_MS) {
      throw new AppException('ORDER_RETURN_EXPIRED');
    }

    // Không hỗ trợ hoàn trả ly in custom tự động
    if (order.items.some((i) => i.isPrintItem)) {
      throw new AppException('ORDER_PRINT_ITEM_NOT_RETURNABLE');
    }

    const updated = await this.repo.updateOrder(orderId, {
      fulfillmentStatus: FulfillmentStatus.RETURNED,
    });

    // Phát sự kiện hoàn trả về kho cho WMS biết để xử lý hoàn nhập kho
    await this.orderQueue.add(EVENTS.ORDER_RETURNED, {
      orderId,
      items: order.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
    });

    this.logger.log(`Yêu cầu đổi trả đơn hàng ${orderId} được xác nhận`);
    return updated;
  }

  // ── CALLBACKS TỪ WMS CONSUMER ──────────────────────────────────────────────

  async onGoodsIssued(orderId: string, goodsIssueId: string) {
    await this.repo.updateOrder(orderId, {
      fulfillmentStatus: FulfillmentStatus.ISSUED,
    });
    this.logger.log(
      `WMS cập nhật: Đơn hàng ${orderId} đã xuất kho (GoodsIssue: ${goodsIssueId})`,
    );
  }

  async onPrintCompleted(orderId: string, printJobId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    // Gán printJobId vào item tương ứng chưa in
    const items = order.items.map((item) =>
      item.isPrintItem && !item.printJobId ? { ...item, printJobId } : item,
    );
    await this.repo.updateOrder(orderId, { items: items });

    // Nếu tất cả ly in của đơn hàng đã được in xong
    const allPrinted = items
      .filter((i) => i.isPrintItem)
      .every((i) => !!i.printJobId);
    if (allPrinted) {
      await this.repo.updateOrder(orderId, {
        fulfillmentStatus: FulfillmentStatus.READY_TO_PICK,
      });

      // Phát lệnh xuất kho
      await this.orderQueue.add(EVENTS.ORDER_READY_TO_FULFILL, {
        orderId,
        fulfillWarehouseId: order.fulfillWarehouseId,
        items: items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
        shippingAddress: order.shippingAddress,
        recipient: {
          name: order.shippingAddress.recipientName,
          phone: order.shippingAddress.phone,
        },
        paymentMethod: 'ONLINE',
      });
      this.logger.log(
        `WMS in xong ly đơn ${orderId} -> READY_TO_PICK -> Phát lệnh xuất kho`,
      );
    }
  }

  async onShipped(orderId: string) {
    await this.repo.updateOrder(orderId, {
      fulfillmentStatus: FulfillmentStatus.SHIPPED,
    });
    this.logger.log(`WMS cập nhật: Đơn hàng ${orderId} đang được giao`);
  }

  async onDelivered(orderId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    const updates: Partial<Order> = {
      fulfillmentStatus: FulfillmentStatus.DELIVERED,
      orderStatus: OrderStatus.CLOSED,
    };

    // Nếu COD -> chuyển sang PAID vì shipper đã thu hộ tiền mặt
    if (order.paymentMethod === PaymentMethod.COD) {
      updates.paymentStatus = PaymentStatus.PAID;
    }

    await this.repo.updateOrder(orderId, updates);
    this.logger.log(
      `WMS cập nhật: Giao thành công đơn ${orderId} -> Đã đóng đơn`,
    );
  }

  async onReturned(orderId: string) {
    const order = await this.repo.findById(orderId);
    if (!order) return;

    const updates: Partial<Order> = {
      fulfillmentStatus: FulfillmentStatus.RETURNED,
      orderStatus: OrderStatus.CANCELLED,
    };

    // Return-to-sender (chưa từng giao thành công) — ONLINE đã trả trước cần hoàn tiền;
    // COD chưa thu được đồng nào nên không cần hoàn.
    if (order.paymentMethod === PaymentMethod.ONLINE) {
      updates.paymentStatus = PaymentStatus.REFUND_PENDING;
    }

    await this.repo.updateOrder(orderId, updates);
    this.logger.log(
      `WMS cập nhật: Đơn ${orderId} hoàn về kho (chưa giao được) -> CANCELLED`,
    );
  }
}
