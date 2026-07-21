import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  EVENTS,
  QUEUES,
  type StockReserveRequestedPayload,
  type OrderCancelledPayload,
} from '@app/events';
import { ReservationService } from './reservation.service';

/**
 * Consumer nhận 2 nhánh của saga giữ tồn kho checkout:
 *   - STOCK_RESERVE_REQUESTED (Ecom→WMS) → giữ tồn, phản hồi STOCK_RESERVED/FAILED.
 *   - ORDER_CANCELLED (Ecom→WMS) → giải phóng tồn đã giữ (nếu có).
 * Cùng QUEUES.ORDER với OrderReadyConsumer/OrderReturnedConsumer — mỗi
 * Processor tự switch(job.name), không xung đột.
 */
@Processor(QUEUES.ORDER)
export class ReservationConsumer extends WorkerHost {
  private readonly logger = new Logger(ReservationConsumer.name);

  constructor(private readonly reservationService: ReservationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.STOCK_RESERVE_REQUESTED: {
        const data = job.data as StockReserveRequestedPayload;
        this.logger.log(
          `Nhận stock.reserve_requested cho đơn ${data.orderId}.`,
        );
        await this.reservationService.reserveForOrder(
          data.orderId,
          data.items,
          data.preferWarehouse,
        );
        break;
      }
      case EVENTS.ORDER_CANCELLED: {
        const data = job.data as OrderCancelledPayload;
        this.logger.log(
          `Nhận order.cancelled cho đơn ${data.orderId} → giải phóng tồn.`,
        );
        await this.reservationService.releaseForOrder(data.orderId);
        break;
      }
      default:
      // Job khác trên order-queue (order.ready_to_fulfill, order.returned, auto.cancel...)
      // thuộc consumer khác — bỏ qua không warn để tránh log nhiễu trùng lặp.
    }
  }
}
