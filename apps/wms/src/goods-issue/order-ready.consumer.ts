import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EVENTS, QUEUES, type OrderReadyToFulfillPayload } from '@app/events';
import { GoodsIssueService } from './goods-issue.service';

/**
 * Consumer nhận order.ready_to_fulfill (Ecom→WMS) — tự sinh GoodsIssue (UC-05).
 * Đơn vào READY_TO_PICK (COD ngay sau checkout / online không ly-in khi
 * payment.success / đơn ly-in sau khi in xong) thì bắn event này.
 */
@Processor(QUEUES.ORDER)
export class OrderReadyConsumer extends WorkerHost {
  private readonly logger = new Logger(OrderReadyConsumer.name);

  constructor(private readonly goodsIssueService: GoodsIssueService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.ORDER_READY_TO_FULFILL: {
        const data = job.data as OrderReadyToFulfillPayload;
        this.logger.log(
          `Nhận order.ready_to_fulfill cho đơn ${data.orderId} → sinh GoodsIssue.`,
        );
        await this.goodsIssueService.createFromOrderReady(
          data.orderId,
          data.fulfillWarehouseId,
          data.items,
          data.shippingAddress,
          data.recipient,
          data.paymentMethod,
          data.codAmount ?? 0,
        );
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên order-queue: ${job.name}`);
    }
  }
}
