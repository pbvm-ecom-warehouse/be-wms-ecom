import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EVENTS, QUEUES, type OrderReturnedPayload } from '@app/events';
import { GoodsReturnService } from './goods-return.service';

/**
 * Consumer nhận order.returned (Ecom→WMS) — tự sinh GoodsReturn DRAFT
 * (UC-09). Cùng QUEUES.ORDER với OrderReadyConsumer (goods-issue module) —
 * mỗi Processor tự switch(job.name), không xung đột.
 */
@Processor(QUEUES.ORDER)
export class OrderReturnedConsumer extends WorkerHost {
  private readonly logger = new Logger(OrderReturnedConsumer.name);

  constructor(private readonly goodsReturnService: GoodsReturnService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.ORDER_RETURNED: {
        const data = job.data as OrderReturnedPayload;
        this.logger.log(
          `Nhận order.returned cho đơn ${data.orderId} → sinh GoodsReturn.`,
        );
        await this.goodsReturnService.createFromOrderReturned(
          data.orderId,
          data.items,
        );
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên order-queue: ${job.name}`);
    }
  }
}
