import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import {
  EVENTS,
  QUEUES,
  StockReservedPayload,
  StockReserveFailedPayload,
} from '@app/events';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { CartService } from '../cart/cart.service';
import { PaymentStatus } from './schemas/order.schema';

/**
 * Consumer nhận job Ecom tự lên lịch trên order-queue:
 *   - auto.cancel -> Đơn hàng ONLINE hết hạn thanh toán -> Hủy đơn.
 *
 * CHỈ còn job nội bộ Ecom trên QUEUES.ORDER ở đây. Phản hồi giữ tồn từ WMS
 * (STOCK_RESERVED/STOCK_RESERVE_FAILED) đã tách sang QUEUES.ORDER_REPLY
 * (xem ReservationReplyConsumer) — order-queue là nơi 3 worker của WMS cũng
 * lắng nghe (competing consumers), nên phản hồi WMS→Ecom không thể chung
 * queue với job Ecom tự phát, tránh worker WMS "cướp" job của Ecom.
 */
@Processor(QUEUES.ORDER)
export class ReserveConsumer extends WorkerHost {
  private readonly logger = new Logger(ReserveConsumer.name);

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly orderService: OrderService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'auto.cancel':
        await this.handleAutoCancel(job);
        break;
      default:
      // Bỏ qua các job không thuộc phạm vi xử lý (vd stock.reserve_requested
      // do chính Ecom phát đi, chỉ WMS mới xử lý).
    }
  }

  private async handleAutoCancel(job: Job) {
    const { orderId } = job.data as { orderId: string };
    const order = await this.orderRepo.findById(orderId);
    if (!order) return;

    // Chỉ hủy nếu đơn hàng vẫn đang chờ thanh toán
    if (order.paymentStatus !== PaymentStatus.UNPAID) return;

    await this.orderService.cancelOrder(
      orderId,
      'Quá hạn thanh toán trực tuyến (30 phút)',
    );
    this.logger.warn(
      `Hệ thống tự động hủy đơn ${orderId} do quá hạn thanh toán`,
    );
  }
}

/**
 * Consumer nhận phản hồi từ WMS sau khi thực hiện chốt tồn kho, trên
 * QUEUES.ORDER_REPLY (WMS → Ecom, tách khỏi QUEUES.ORDER để tránh 3 worker
 * của WMS trên order-queue cướp job phản hồi vốn dành cho Ecom):
 *   - STOCK_RESERVED -> Cập nhật kho chốt, tiến hành bước tiếp theo.
 *   - STOCK_RESERVE_FAILED -> Hủy đơn và phục hồi giỏ hàng.
 */
@Processor(QUEUES.ORDER_REPLY)
export class ReservationReplyConsumer extends WorkerHost {
  private readonly logger = new Logger(ReservationReplyConsumer.name);

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly orderService: OrderService,
    private readonly cartService: CartService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.STOCK_RESERVED:
        await this.handleReserved(job);
        break;
      case EVENTS.STOCK_RESERVE_FAILED:
        await this.handleReserveFailed(job);
        break;
      default:
      // Bỏ qua các job không thuộc phạm vi xử lý
    }
  }

  private async handleReserved(job: Job) {
    const { orderId, fulfillWarehouseId } = job.data as StockReservedPayload;
    const order = await this.orderRepo.findById(orderId);
    if (!order) return;

    await this.orderRepo.updateOrder(orderId, { fulfillWarehouseId });
    await this.orderService.onStockReserved(orderId);
    this.logger.log(
      `Giữ kho thành công: Đơn hàng ${orderId} -> Kho ${fulfillWarehouseId}`,
    );
  }

  private async handleReserveFailed(job: Job) {
    const { orderId, reason } = job.data as StockReserveFailedPayload;
    const order = await this.orderRepo.findById(orderId);
    if (!order) return;

    // Hủy đơn hàng cục bộ
    await this.orderService.cancelOrder(
      orderId,
      `WMS giữ kho thất bại: ${reason}`,
    );

    // Phục hồi lại giỏ hàng cho khách để họ không bị mất các mặt hàng đã chọn
    try {
      for (const item of order.items) {
        await this.cartService.addItem(order.customerId.toString(), {
          sku: item.sku,
          quantity: item.quantity,
          designId: item.designId,
          designFile: item.designFile,
        });
      }
      this.logger.log(
        `Đã phục hồi giỏ hàng thành công cho khách hàng của đơn bị hủy: ${orderId}`,
      );
    } catch (err) {
      this.logger.error(
        `Không thể phục hồi giỏ hàng cho khách hàng ${order.customerId.toString()}:`,
        err,
      );
    }
  }
}
