import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  EVENTS,
  QUEUES,
  type StockReserveRequestedPayload,
  type OrderCancelledPayload,
  type OrderReadyToFulfillPayload,
  type OrderReturnedPayload,
} from '@app/events';
import { ReservationService } from '../reservation/reservation.service';
import { GoodsIssueService } from '../goods-issue/goods-issue.service';
import { GoodsReturnService } from '../goods-return/goods-return.service';

@Processor(QUEUES.ORDER)
export class OrderConsumer extends WorkerHost {
  private readonly logger = new Logger(OrderConsumer.name);

  constructor(
    private readonly reservationService: ReservationService,
    private readonly goodsIssueService: GoodsIssueService,
    private readonly goodsReturnService: GoodsReturnService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.STOCK_RESERVE_REQUESTED: {
        const data = job.data as StockReserveRequestedPayload;
        this.logger.log(
          `Nhận stock.reserve_requested cho đơn ${data.orderId}.`,
        );
        await this.reservationService.reserveForOrder(data.orderId, data.items);
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
      case EVENTS.ORDER_READY_TO_FULFILL: {
        const data = job.data as OrderReadyToFulfillPayload;
        this.logger.log(
          `Nhận order.ready_to_fulfill cho đơn ${data.orderId} → sinh GoodsIssue.`,
        );
        await this.goodsIssueService.createFromOrderReady(
          data.orderId,
          data.orderCode,
          data.items,
          data.shippingAddress,
          data.recipient,
          data.paymentMethod,
          data.codAmount ?? 0,
        );
        break;
      }
      case EVENTS.ORDER_RETURNED: {
        const data = job.data as OrderReturnedPayload;
        this.logger.log(
          `Nhận order.returned cho đơn ${data.orderId} → sinh GoodsReturn.`,
        );
        await this.goodsReturnService.createFromOrderReturned(
          data.orderId,
          data.orderCode,
          data.items,
        );
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên order-queue: ${job.name}`);
    }
  }
}
